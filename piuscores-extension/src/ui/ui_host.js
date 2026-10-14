// All extension UI lives in one shadow root, so the page's styles don't leak in.
// Each part adds its own styles to it with `useStyles` before placing its elements.

const baseStyles = `
  .buttons { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
             display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
  .btn { background: #14201A; color: #4FE33F; border: 1px solid #4FE33F; border-radius: 6px;
         padding: 8px 12px; font: 600 13px/1 Roboto, Arial, sans-serif; cursor: pointer;
         box-shadow: 0 4px 14px rgba(0,0,0,.5); }
  .btn:hover:not(:disabled) { background: #1C2B22; }
  .pos { color: #4FE33F; }
  .neg { color: #FF2A00; }
  .pos.muted { color: #7BA874; }
  .neg.muted { color: #B86A5C; }
`;

let host = null;
const styled = new Set();


// The page may drop the host when it re-renders its body, so it is put back on every call.
export function uiRoot() {
  if (! host) {
    host = document.createElement('div');
    host.attachShadow({ mode: 'open' }).innerHTML = `<style>${baseStyles}</style><div class="buttons"></div>`;
  }

  if (! host.isConnected)
    document.body.appendChild(host);

  return host.shadowRoot;
}


// Adds `css` once per `name` and returns the shadow root.
export function useStyles(name, css) {
  const root = uiRoot();
  if (! styled.has(name)) {
    styled.add(name);

    const style = document.createElement('style');
    style.textContent = css;
    root.appendChild(style);
  }

  return root;
}


// The bottom-left stack shared by the RIVALS and grab scores buttons.
export const buttonStack = () => uiRoot().querySelector('.buttons');
