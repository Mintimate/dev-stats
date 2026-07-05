export function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-container">
        <div className="footer-left">
          <a href="https://pages.edgeone.ai/" target="_blank" className="footer-logo-link" rel="noreferrer">
            <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>Powered by</span>
            <img src="/edgeone-logo.svg" alt="Tencent EdgeOne" className="footer-logo-img" />
          </a>
          <span className="footer-divider">·</span>
          <a href="https://github.com/Mintimate/dev-stats" target="_blank" rel="noreferrer">@Mintimate/dev-stats</a>
        </div>
        <div className="footer-right">
          <span className="footer-text">模型支持: <a href="https://tdp.fan" target="_blank" rel="noreferrer">腾讯云 TDP 社区</a></span>
          <span className="footer-divider">·</span>
          <span className="footer-text">致谢: <a href="https://ghfind.com/" target="_blank" rel="noreferrer">ghfind</a> & <a href="https://cnb.cool/Commit/Roast" target="_blank" rel="noreferrer">Commit Roast</a></span>
          <span className="footer-divider">·</span>
          <span className="footer-text">作者: <a href="https://www.mintimate.cn" target="_blank" rel="noreferrer">博客</a> / <a href="https://space.bilibili.com/355567627" target="_blank" className="bilibili-link" rel="noreferrer">B站</a></span>
        </div>
      </div>
    </footer>
  );
}
