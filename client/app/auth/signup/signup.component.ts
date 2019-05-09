import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import { AuthService } from '../auth.service';
import { UserService } from '../../user/user.service';
import { ValidationService } from '../../shared/control-errors/validation.service';

@Component({
  selector: 'auth-signup',
  templateUrl: 'signup.component.html',
})

export class SignupComponent implements OnInit {
  form: FormGroup;
  errors: {} = {};

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private toastr: ToastsManager,
    private authService: AuthService,
    private userService: UserService,
    private validationService: ValidationService,
  ) {
    this.form = this.formBuilder.group({
      email: ['', [Validators.required, this.validationService.emailValidator]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      this.toastr.success('You are already logged in', 'Logged In!');
    }
  }

  register(form: FormGroup) {
    if (form.valid) {
      this.userService.create({
        email: form.value.email,
        password: form.value.password,
      })
      .then((response) => {
        // Set auth token and current user from response
        this.authService.setToken(response.token);
        this.authService.currentUser = response;
        this.toastr.success('Successfully created an account!', 'Success!');
        this.router.navigate(['/']);
      })
      .catch((err) => {
        const errors = err.json();
        this.toastr.error('There was an issue creating your account.', 'Whoops!');
        this.validationService.buildServerErrors(form, errors);
      });
    }
  }

}
