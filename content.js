// Adds an "Edit video" button to X's composer toolbar. It edits the video already attached to
// that composer (or asks for one), opens the clip editor over the page, and attaches the result.
(() => {
  const FILE_INPUT = 'input[type=file][data-testid="fileInput"]';
  const BUTTON_ID = 'clipEditorButton';
  const ICON = '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="5" width="12.5" height="14" rx="3"/><path d="M15.5 10l5-3v10l-5-3"/><path d="M6.5 9.5v5M12 9.5v5"/></g>';
  const isVideo = f => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name);
  // X re-creates its file input after attaching, so remember the video itself, not the element.
  let lastVideo = null;
  let open = false;

  // Watch (never block) what X's own media button attaches.
  window.addEventListener('change', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.matches(FILE_INPUT)) return;
    const video = [...input.files].find(isVideo);
    if (video) lastVideo = video;
  }, true);

  let assets;
  const loadAssets = () => assets ??= Promise.all([
    import(chrome.runtime.getURL('editor.js')),
    fetch(chrome.runtime.getURL('editor.css')).then(r => r.text()),
  ]);

  // The editor lives in a shadow root on the page (not an iframe) so X's styles can't leak in.
  async function openEditor(file) {
    open = true;
    const [{ mountEditor }, css] = await loadAssets();
    const host = document.createElement('div');
    host.id = 'clip-editor-for-x';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host { all: initial; }\n' + css;
    const backdrop = document.createElement('div');
    backdrop.className = 'ce-backdrop';
    root.append(style, backdrop);
    // Keep X's composer from seeing these as outside clicks or focus leaving its dialog.
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'focusin', 'focusout', 'wheel']) {
      host.addEventListener(type, e => e.stopPropagation());
    }
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.appendChild(host);

    return new Promise(resolve => {
      const close = result => {
        editor.destroy();
        host.remove();
        document.documentElement.style.overflow = prevOverflow;
        open = false;
        resolve(result);
      };
      const editor = mountEditor(backdrop, { embed: true, file, onDone: f => close(f), onCancel: () => close(null) });
    });
  }

  // Hand the clip to X exactly as if the user had picked it with X's own media button.
  function attach(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pickVideo() {
    return new Promise(resolve => {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'video/*,.mov,.mp4,.m4v,.webm';
      picker.addEventListener('change', () => resolve(picker.files[0] || null), { once: true });
      picker.addEventListener('cancel', () => resolve(null), { once: true });
      picker.click();
    });
  }

  // The composer around a toolbar: the nearest container with the post's text box, which also
  // holds the attachments. X's file input sits inside the toolbar itself.
  function composerOf(toolbar) {
    for (let el = toolbar?.parentElement; el; el = el.parentElement) {
      if (!el.querySelector('[data-testid^="tweetTextarea_"]')) continue;
      const input = toolbar.querySelector(FILE_INPUT) || el.querySelector(FILE_INPUT);
      return input ? { input, scope: el } : null;
    }
    return null;
  }

  async function removeAttachedVideo(scope) {
    const remove = scope.querySelector('[data-testid="attachments"] [aria-label="Remove media"]');
    if (!remove) return;
    remove.click();
    for (let i = 0; i < 40 && scope.querySelector('[data-testid="attachments"] video'); i++) await new Promise(r => setTimeout(r, 50));
  }

  async function onButton(button) {
    if (open) return;
    const toolbar = () => button.closest('[data-testid="toolBar"]');
    const composer = composerOf(toolbar());
    if (!composer) return;
    const attached = composer.scope.querySelector('[data-testid="attachments"] video') && lastVideo;
    const file = attached || await pickVideo();
    if (!file) return;
    const edited = await openEditor(file);
    if (!edited || edited === file) return;
    if (!button.isConnected) return;
    if (attached) await removeAttachedVideo(composerOf(toolbar()).scope);
    attach(composerOf(toolbar()).input, edited);
  }

  // Build the button from X's own GIF button so it matches the theme and spacing.
  function addButton(toolbar) {
    const list = toolbar.querySelector('[data-testid="ScrollSnap-List"]');
    const gifItem = list?.querySelector('[data-testid="gifSearchButton"]')?.closest('[role="presentation"]');
    if (!gifItem || list.querySelector(`[data-testid="${BUTTON_ID}"]`)) return;
    const item = gifItem.cloneNode(true);
    const button = item.querySelector('button');
    button.setAttribute('aria-label', 'Edit video');
    button.setAttribute('title', 'Trim & crop a video');
    button.dataset.testid = BUTTON_ID;
    button.disabled = false;
    button.removeAttribute('aria-disabled');
    button.style.opacity = '1';
    item.querySelector('svg').innerHTML = ICON;
    item.querySelectorAll('span').forEach(s => s.removeAttribute('style'));
    button.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      onButton(button);
    });
    gifItem.after(item);
  }

  const scan = () => document.querySelectorAll('[data-testid="toolBar"]').forEach(addButton);
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; scan(); }, 50);
  }).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
