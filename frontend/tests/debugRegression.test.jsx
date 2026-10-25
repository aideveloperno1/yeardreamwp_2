import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import { streamChat } from '../src/services/chatClient.js';
import { keys, validChat, validRuns } from '../src/lib/storage.js';
import { line, sourcesLine, source, wire, chatResponse } from './chatFixture.js';

const response = (body) => new Response(body, {headers:{'Content-Type':'application/x-ndjson'}});
const mount = () => { render(<MemoryRouter><App /></MemoryRouter>); fireEvent.change(screen.getByLabelText('연결 모드'), {target:{value:'live'}}); };
const ask = (q='추가 검증') => {fireEvent.change(screen.getByLabelText('질문 입력'), {target:{value:q}}); fireEvent.click(screen.getByRole('button',{name:'보내기'}));};

it.each(['done', 'error'])('settles after %s without waiting for HTTP EOF', async(kind)=>{
  let controller;
  const cancelled = vi.fn();
  const ending = kind==='done' ? line('done',{status:'completed',finish_reason:'stop'}) : line('error',{code:'LLM_ERROR',stage:'generation',message:'의도한 오류'});
  const body = new ReadableStream({start(c){controller=c;c.enqueue(new TextEncoder().encode(sourcesLine+line('delta',{text:'이미 받은 본문'})+ending));},cancel:cancelled});
  const result = await Promise.race([
    streamChat({q:'q',fetcher:async()=>response(body)}).then(()=> 'done',e=>e.message),
    new Promise(resolve=>setTimeout(()=>resolve('STILL_WAITING'),150)),
  ]);
  if(result==='STILL_WAITING') controller.close();
  expect(result).toBe(kind==='done'?'done':'의도한 오류');
  expect(cancelled).toHaveBeenCalledTimes(1);
});

it.each(['sources','partial'])('starts next request after cancelling %s and ignores old output',async(phase)=>{
  let old;
  const fetcher=vi.fn().mockResolvedValueOnce(response(new ReadableStream({start(c){old=c;c.enqueue(new TextEncoder().encode(sourcesLine+(phase==='partial'?line('delta',{text:'옛 답변'}):'')));}}))).mockResolvedValueOnce(chatResponse('새 요청의 답변'));
  vi.stubGlobal('fetch',fetcher); mount(); ask('첫 질문');
  await screen.findByText('제13조 · 안전난간');
  fireEvent.click(screen.getByRole('button',{name:'＋ 새 상담',exact:true}));
  ask('두 번째 질문');
  await screen.findByText('새 요청의 답변');
  await act(async()=>{try{old.enqueue(new TextEncoder().encode(line('delta',{text:'늦게 온 옛 답변'})));old.close();}catch{/* reader was cancelled */}});
  expect(screen.queryByText('늦게 온 옛 답변')).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const runs=JSON.parse(localStorage.getItem(keys('live').runs));
  expect(runs).toHaveLength(2);
  expect(runs[0]).toMatchObject({status:'interrupted',retrievedSources:[source]});
  expect(runs[1]).toMatchObject({answer:'새 요청의 답변',generationStatus:'completed'});
});

it('continues a successful answer when storage quota is exceeded',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>chatResponse('저장 실패에도 받은 답변')));
  mount();
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('quota','QuotaExceededError');});
  ask();
  await screen.findByText('답변 생성 완료');
  expect(screen.getByText('저장 실패에도 받은 답변')).toBeInTheDocument();
  expect(screen.getByText(/브라우저 저장이 차단/)).toBeInTheDocument();
});

it('keeps nullable metadata, repeated articles and long filenames without inventing values',async()=>{
  const items=[source,{...source,source_id:'S2',chunk_index:1},{source_id:'S3',law_name:null,article_number:null,article_title:null,filename:'긴파일명'.repeat(100)+'.pdf',chunk_index:null}];
  const body=line('sources',{search_status:'found',items})+line('delta',{text:'메타데이터 검증'})+line('done',{status:'completed',finish_reason:'stop'});
  vi.stubGlobal('fetch',vi.fn(async()=>response(body)));mount();ask();
  await screen.findByText('답변 생성 완료');
  expect(screen.getAllByText('제13조 · 안전난간')).toHaveLength(2);
  expect(screen.getByText('조문 번호 미기록')).toBeInTheDocument();
  const chat=JSON.parse(localStorage.getItem(keys('live').chat));
  const runs=JSON.parse(localStorage.getItem(keys('live').runs));
  expect(validChat(chat)).toBe(true);expect(validRuns(runs)).toBe(true);
  expect(runs[0].retrievedSources).toEqual(items);
});

it('rejects invalid UTF-8 and preserves already delivered text',async()=>{
  let text='';
  const good=new TextEncoder().encode(sourcesLine+line('delta',{text:'정상 앞부분'}));
  const body=new ReadableStream({start(c){c.enqueue(good);c.enqueue(Uint8Array.of(0xff));c.close();}});
  await expect(streamChat({q:'q',onText:v=>text=v,fetcher:async()=>response(body)})).rejects.toThrow();
  expect(text).toBe('정상 앞부분');
});

it('updates text once for many deltas delivered in one network read',async()=>{
  const onText=vi.fn();
  const body=sourcesLine+Array.from({length:100},()=>line('delta',{text:'가'})).join('')+line('done',{status:'completed',finish_reason:'stop'});
  const result=await streamChat({q:'q',onText,fetcher:async()=>response(body)});
  expect(result.text).toBe('가'.repeat(100));
  expect(onText).toHaveBeenCalledTimes(1);
  expect(onText).toHaveBeenCalledWith(result.text);
});

it('delivers valid text before a malformed record in the same network read',async()=>{
  const onText=vi.fn();
  const body=sourcesLine+line('delta',{text:'오류 직전의 유효한 내용'})+'{broken}\n';
  await expect(streamChat({q:'q',onText,fetcher:async()=>response(body)})).rejects.toThrow('응답 형식');
  expect(onText).toHaveBeenCalledWith('오류 직전의 유효한 내용');
});
