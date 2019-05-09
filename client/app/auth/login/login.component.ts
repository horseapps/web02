import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';

import { AuthService } from '../auth.service';
import { ValidationService } from '../../shared/control-errors/validation.service';

@Component({
  selector: 'auth-login',
  templateUrl: 'login.component.html',
})

export class LoginComponent implements OnInit {
  form: FormGroup;

  constructor(
    private formBuilder: FormBuilder,
    private validationService: ValidationService,
    private router: Router,
    private toastr: ToastsManager,
    private authService: AuthService,
  ) {

    this.form = this.formBuilder.group({
      email: ['', [Validators.required, this.validationService.emailValidator]],
      password: ['', [Validators.required]],
    });
  }

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      this.toastr.success('You are already logged in', 'Logged In!');
    }
  }

  login() {
    if (this.form.valid) {
      const email =  this.form.value.email;
      const password = this.form.value.password;
      this.authService.login(email, password)
        .then((response) => {
          this.form.reset();
          this.toastr.success('You are logged in!', 'Success!');
          this.router.navigate(['/']);
        })
        .catch((err) => {
          const message = err.json().message || 'Could not login';
          this.toastr.error(message, 'Whoops!');
        });
    }
  }

}
