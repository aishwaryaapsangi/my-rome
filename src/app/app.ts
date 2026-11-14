import { Component } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <header class="topbar">
      <b>🍋 La Dolce Vita · Italy 2027</b>
      <a href="studio.html" target="_blank" rel="noopener">Full-screen travel studio ↗</a>
    </header>
    <iframe [src]="studioUrl" title="La Dolce Vita interactive Italy trip planner"
            allow="clipboard-write" referrerpolicy="no-referrer"></iframe>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#fffafc}
    .topbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px;font:700 13px system-ui;color:#9b5a7e;background:#ffedf5;border-bottom:1px solid #e7cbda}
    a{color:#aa537f;text-decoration:none}
    iframe{display:block;width:100%;height:calc(100vh - 48px);min-height:800px;border:0}
  `]
})
export class App {
  studioUrl: SafeResourceUrl;
  constructor(sanitizer: DomSanitizer) {
    this.studioUrl = sanitizer.bypassSecurityTrustResourceUrl('studio.html');
  }
}
