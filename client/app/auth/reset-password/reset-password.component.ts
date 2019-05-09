import { Component, OnInit, ViewContainerRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import { AuthService } from '../auth.service';
import { ValidationService } from '../../shared/control-errors/validation.service';

@Component({
  selector: 'auth-reset-password',
  templateUrl: 'reset-password.component.html',
})

export class ResetPasswordComponent implements OnInit {
  form: FormGroup;
  token: string;

  constructor(
    private formBuilder: FormBuilder,
    private toastr: ToastsManager,
    private authService: AuthService,
    private validationService: ValidationService,
    private route: ActivatedRoute,
    private vRef: ViewContainerRef,
  ) {
    this.toastr.setRootViewContainerRef(vRef);
  }

  ngOnInit(): void {
    this.form = this.formBuilder.group({
      password: ['', [Validators.required, this.validationService.passwordValidator]],
      confirmPassword: ['', [Validators.required, this.validationService.passwordValidator]],
    });

    // Get token from params
    this.route.params.subscribe((params) => {
      this.token = params.token;
      this.confirmToken();
    });
  }

  confirmToken() {
    this.authService.confirmResetToken(this.token)
      .catch((response) => {
        const errors = response.json();
        if (errors.message) {
          this.toastr.error(errors.message, 'Whoops!');
        } else {
          this.validationService.buildServerErrors(this.form, errors);
          this.toastr.error('Could not send reset instructions!', 'Whoops!');
        }
      });
  }

  resetPassword(form: FormGroup): void {
    if (form.valid) {
      this.authService.resetPassword({ token: this.token, password: form.controls.password.value })
        .then((response) => {
          this.toastr.success(response.message, 'Success!');
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
