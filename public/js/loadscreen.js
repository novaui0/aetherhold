// loadscreen.js — Aetherhold world giriş yüklenecek ekranı
// Menu → World geçişinde kısa bir yükleme ekranı gösterilir. Gerçek bir loading progress'i yoksa
// bile geçişi görselleştirir ve gebruiker feedback verir.

export class LoadScreen {
  constructor(host) {
    this.host = host;
    this.visible = false;
    this.elapsed = 0;
    this.doneAt = null;
    this._build();
  }

  _build() {
    if (!this.host?.element) return;
    const root = this.host.element;

    this.overlay = document.createElement("div");
    this.overlay.className = "load-overlay";
    this.overlay.innerHTML = `
      <div class="load-card">
        <div class="load-spinner"></div>
        <div class="load-bar-track">
          <div class="load-bar-fill"></div>
        </div>
        <div class="load-text" data-text>Dünya yükleniyor…</div>
        <div class="load-sub" data-sub>Oyun içi yapılandırılıyor</div>
      </div>
    `;

    root.appendChild(this.overlay);
  }

  show(message = "Dünya yükleniyor…", sub = "Oyun içi yapılandırılıyor") {
    if (!this.overlay) this._build();
    if (!this.overlay) return;
    this.visible = true;
    this.overlay.classList.remove("load-hidden");
    this.elapsed = 0;
    this.doneAt = null;
    const textEl = this.overlay.querySelector("[data-text]");
    const subEl = this.overlay.querySelector("[data-sub]");
    if (textEl) textEl.textContent = message;
    if (subEl) subEl.textContent = sub;
    this._updateBar(0);
  }

  hide() {
    this.visible = false;
    if (this.overlay) this.overlay.classList.add("load-hidden");
  }

  tick(dtSec) {
    if (!this.visible || !this.overlay) return;
    this.elapsed += dtSec;

    // Progress bar'ı 0→100 arası, ancak gerçek bir yükleme yoksa
    // şu an sadece görsel bir tamamlama animasyonu.
    const progress = Math.min(1, this.elapsed / 1.4);
    this._updateBar(progress);

    const textEl = this.overlay.querySelector("[data-text]");
    const subEl = this.overlay.querySelector("[data-sub]");
    if (this.elapsed >= 1.4) {
      if (textEl) textEl.textContent = "Hazır";
      if (subEl) subEl.textContent = "Gezinmeye başlayın";
      this._updateBar(1);

      // Animasyonun tamamlandığını işaretle; ancak bu hala bir sinyal
      // değil, ekran otomatik kapanmaz (iyice donup kalmasın diye).
      this._reachedEnd = true;
    }

  }

  _updateBar(progress) {
    const fill = this.overlay?.querySelector(".load-bar-fill");
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
  }

  // Yükleme gerçekten bittiğinde çağrılır; ekranı "Hazır"a alır ve kapatır.
  complete() {
    this.doneAt = performance.now();
    const textEl = this.overlay?.querySelector("[data-text]");
    const subEl = this.overlay?.querySelector("[data-sub]");
    if (textEl) textEl.textContent = "Hazır";
    if (subEl) subEl.textContent = "Gezinmeye başlayın";
    this._updateBar(1);
    this._closeSoon();
  }

  // Animasyon sonuna ulaşmış ama hiç complete() çağrılmadıysa kapanmayı
  // garanti eder (tek seferlik: her frame yeni bir zamanlayıcı kurmaz).
  maybeClose() {
    if (this._reachedEnd && this.doneAt == null) this._closeSoon();
  }

  _closeSoon() {
    if (!this.overlay || this._closing) return;
    this._closing = true;
    this.overlay.classList.add("load-hidden");
    setTimeout(() => {
      this.visible = false;
      this._closing = false;
    }, 350);
  }
}
