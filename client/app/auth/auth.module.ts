import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';

import { LayoutComponent } from './layout/layout.component';
import { LoginComponent } from './login/login.component';
import { SignupComponent } from './signup/signup.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';
import { LogoutComponent } from './logout/logout.component';

import { AuthService } from './auth.service';
import { AuthRoutingModule } from './auth-routing.module';
import { ControlErrorsModule } from '../shared/control-errors/control-errors.module';

import { ConstantsService } from '../providers/constants.service';
import { UserService } from '../user/user.service';
import { ValidationService } from '../shared/control-errors/validation.service';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpModule,
    AuthRoutingModule,
    ControlErrorsModule,
  ],
  declarations: [
    LayoutComponent,
    LoginComponent,
    SignupComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    LogoutComponent,
  ],
  providers: [
    AuthService,
    UserService,
    ConstantsService,
    ValidationService,
  ],
})
export class AuthModule { }
