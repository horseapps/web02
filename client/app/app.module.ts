import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Http, BrowserXhr } from '@angular/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { SnapJSAdminModule } from '@snapmobile/snapjs-admin';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { AuthModule } from './auth/auth.module';
import { ControlErrorsModule } from './shared/control-errors/control-errors.module';
import { ToastModule } from 'ng2-toastr/ng2-toastr';
import { NgProgressModule, NgProgressBrowserXhr } from 'ngx-progressbar';

import { StripeApproveComponent } from './stripe/stripe-approve/stripe-approve.component';
import { StripeDenyComponent } from './stripe/stripe-deny/stripe-deny.component';

import { ExtendedHttpService } from './providers/extended-http.service';
import { ConstantsService } from './providers/constants.service';

import { Angulartics2Module, Angulartics2GoogleAnalytics } from 'angulartics2';

@NgModule({
  declarations: [
    AppComponent,
    StripeApproveComponent,
    StripeDenyComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    ReactiveFormsModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    SnapJSAdminModule.forRoot(ConstantsService),
    AuthModule,
    ControlErrorsModule,
    ToastModule.forRoot(),
    NgProgressModule,
    Angulartics2Module.forRoot([ Angulartics2GoogleAnalytics ]),
  ],
  providers: [
    ConstantsService,
    { provide: Http, useClass: ExtendedHttpService },
    { provide: BrowserXhr, useClass: NgProgressBrowserXhr },
  ],
  bootstrap: [AppComponent],
})
export class AppModule { }
