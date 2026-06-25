// 游戏预览工具函数

// 注入 CSS 让游戏完整显示在预览框内（缩放适配）
export function injectGameCSS(html: string): string {
  const css = `<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    canvas { display: block; margin: auto; max-width: 100%; max-height: 100%; }
  </style>`;

  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>${css}`);
  } else if (html.includes('<html>')) {
    return html.replace('<html>', `<html><head>${css}</head>`);
  } else {
    return `<!DOCTYPE html><html><head>${css}</head><body>${html}</body></html>`;
  }
}

// 不注入 CSS 的原始版本（用于下载）
export function getRawHtml(html: string): string {
  if (html.includes('<html>') || html.includes('<!DOCTYPE')) {
    return html;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}
