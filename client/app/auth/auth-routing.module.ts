import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { LayoutComponent } from './layout/layout.component';
import { LoginComponent } from './login/login.component';
import { SignupComponent } from './signup/signup.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';
import { LogoutComponent } from './logout/logout.component';

const authRoutes: Routes = [
  { path: 'auth',  component: LayoutComponent,
    children: [
      { path: 'login',  component: LoginComponent },
      { path: 'signup',  component: SignupComponent },
      { path: 'forgot',  component: ForgotPasswordComponent },
      { path: 'reset/:token',  component: ResetPasswordComponent },
      { path: 'logout',  component: LogoutComponent },
    ],
  },
];

@NgModule({
  imports: [ RouterModule.forChild(authRoutes) ],
  exports: [ RouterModule ],
})
export class AuthRoutingModule { }
