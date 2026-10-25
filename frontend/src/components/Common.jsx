import { useEffect, useId, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import M from "../lib/mockData.js";
import { useApp } from "../hooks/AppState.jsx";
import useTheme from "../hooks/useTheme.js";

export const routeFor = (id) => "/" + id;
export function Badge({ kind = "ex", children }) {
  return (
    <span className={"badge badge-" + kind}>
      {children ||
        {
          ex: "예시 데이터",
          verify: "원문 대조 필요",
          missing: "현재 미구현",
          have: "코드에 있음",
        }[kind] ||
        kind}
    </span>
  );
}
export function Table({ heads, children, label }) {
  return (
    <div className="table-wrap">
      <table className="data" aria-label={label}>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Tabs({ tabs, value, onChange }) {
  const id = useId();
  const refs = useRef([]);
  const index = Math.max(
    0,
    tabs.findIndex((t) => t.id === value),
  );
  return (
    <div data-tabs="">
      <div className="tabs" role="tablist" aria-label="화면 내용">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(e) => (refs.current[i] = e)}
            type="button"
            id={id + "-tab-" + t.id}
            role="tab"
            aria-selected={value === t.id}
            aria-controls={id + "-panel-" + t.id}
            tabIndex={i === index ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const n = {
                ArrowRight: (i + 1) % tabs.length,
                ArrowLeft: (i + tabs.length - 1) % tabs.length,
                Home: 0,
                End: tabs.length - 1,
              }[e.key];
              if (n !== undefined) {
                e.preventDefault();
                onChange(tabs[n].id);
                refs.current[n]?.focus();
              }
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <section
          key={t.id}
          className="tab-panel"
          role="tabpanel"
          id={id + "-panel-" + t.id}
          aria-labelledby={id + "-tab-" + t.id}
          hidden={value !== t.id}
        >
          {t.content}
        </section>
      ))}
    </div>
  );
}
export function Shell({ children }) {
  const app = useApp();
  const location = useLocation();
  const [theme, setTheme] = useTheme();
  useEffect(() => {
    document.body.classList.toggle(
      "internal-page",
      location.pathname !== "/chat",
    );
    return () => document.body.classList.remove("internal-page");
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        본문으로 이동
      </a>
      <div className="wrap">
        <div className="appearance-bar">
          <div className="theme-switch" role="group" aria-label="화면 모드">
            {[
              ["light", "일반 모드", "☀"],
              ["dark", "다크 모드", "☾"],
              ["system", "시스템 설정 따르기", "▣"],
            ].map(([id, name, symbol]) => (
              <button
                key={id}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={theme === id}
                onClick={() => setTheme(id)}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
        <section className="review" aria-label="연결 모드와 페이지 이동">
          <div className="review-strip">
            <span className="grow">
              <strong>
                {app.mode === "mock" ? "팀 검토용 목업" : "실제 API 연결 모드"}
              </strong>{" "}
              ·{" "}
              {app.mode === "mock"
                ? "실제 AI·검색 미연결"
                : "상담·PDF 등록·평가 결과 조회 연결"}
            </span>
            <label className="mode-select">
              연결 모드{" "}
              <select
                aria-label="연결 모드"
                value={app.mode}
                disabled={app.locked}
                onChange={(e) => app.changeMode(e.target.value)}
              >
                <option value="mock">모의</option>
                <option value="live">실제 API</option>
              </select>
            </label>
          </div>
          <nav className="mock-nav" aria-label="페이지 이동">
            {["사용자 화면", "관리자용 목업", "개발·평가용", "회의용"].map(
              (group) => (
                <span className="mock-nav-group" key={group}>
                  <span className="mock-nav-label">{group}</span>
                  {M.pages
                    .filter((p) => p.group === group)
                    .map((p) => (
                      <NavLink key={p.id} to={routeFor(p.id)}>
                        {p.name}
                      </NavLink>
                    ))}
                </span>
              ),
            )}
          </nav>
          {app.mode === "live" && (
            <p className="note">
              상담 대상: 산업안전보건기준에 관한 규칙 (현재 서버 계약 기준).
              질문마다 필요한 상황을 함께 적어 주세요. PDF 등록 법령은 등록
              화면에서 설정합니다.
            </p>
          )}
        </section>
        {app.warning && (
          <p className="note" role="status">
            {app.warning}
          </p>
        )}
        {children}
      </div>
    </>
  );
}
export function Page({ title, description, children }) {
  return (
    <div className="product secondary-product">
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="page-body">
        {children}
      </main>
    </div>
  );
}
export function NotFound({ what = "페이지" }) {
  return (
    <div className="card">
      <h2>
        {what}
        {what === "페이지" ? "를" : "을"} 찾을 수 없습니다.
      </h2>
      <p>주소와 현재 브라우저의 기록 보관 범위를 확인하세요.</p>
      <Link to="/chat">상담으로 이동</Link>
    </div>
  );
}
