import { Component, ViewContainerRef, ViewEncapsulation } from '@angular/core';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import { Angulartics2GoogleAnalytics } from 'angulartics2';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title: string = 'app works!';

  constructor(
    public toastr: ToastsManager,
    private vcr: ViewContainerRef,
    public angulartics2GoogleAnalytics: Angulartics2GoogleAnalytics,
  ) {
    this.toastr.setRootViewContainerRef(vcr);
  }
}
