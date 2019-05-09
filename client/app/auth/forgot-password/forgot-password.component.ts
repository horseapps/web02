import { Component, OnInit, ViewContainerRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';

import { AuthService } from '../auth.service';
import { ValidationService } from '../../shared/control-errors/validation.service';

@Component({
  selector: 'auth-forgot-password',
  templateUrl: 'forgot-password.component.html',
})

export class ForgotPasswordComponent implements OnInit {
  form: FormGroup;

  constructor(
    private formBuilder: FormBuilder,
    private toastr: ToastsManager,
    private authService: AuthService,
    private validationService: ValidationService,
    private vRef: ViewContainerRef,
  ) {
    this.toastr.setRootViewContainerRef(vRef);
  }

  ngOnInit(): void {
    this.form = this.formBuilder.group({
      email: ['', [Validators.required, this.validationService.emailValidator]],
    });
  }

  forgotPassword(form: FormGroup): void {
    if (form.valid) {
      this.authService.forgotPassword(form.value.email)
        .then((response) => {
          this.toastr.success('We sent you an email with instructions on how to reset your password.', 'Success!');
          form.reset();
        })
        .catch((response) => {
          const errors = response.json();

          if (errors.message) {
            this.toastr.error(errors.message, 'Whoops!');
          } else {
            this.validationService.buildServerErrors(form, errors);
            this.toastr.error('Could not send reset instructions!', 'Whoops!');
          }
        });
    }
  }

}
