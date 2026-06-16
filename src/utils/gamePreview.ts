// 游戏预览工具函数

// 注入 CSS 让游戏自适应 iframe（防止拉伸变形和溢出）
export function injectGameCSS(html: string): string {
  const css = `<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    canvas {
      display: block;
      max-width: 100%;
      max-height: 100vh;
      width: auto;
      height: auto;
      object-fit: contain;
    }
  </style>`;

  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>${css}`);
  } else if (html.includes('<html>')) {
    return html.replace('<html>', `<html><head>${css}</head>`);
  } else {
    return `<!DOCTYPE html><html><head>${css}</head><body>${html}</body></html>`;
  }
}
