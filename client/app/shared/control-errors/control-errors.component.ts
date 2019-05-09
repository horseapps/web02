import { Component, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ValidationService } from './validation.service';

@Component({
  selector: 'control-errors',
  template: `<div *ngIf="!!errorMessage() && this.control.dirty" class="form-control-error">{{errorMessage()}}</div>`,
})
export class ControlErrorsComponent {
  @Input() control: FormControl;

  constructor(
    public validationService: ValidationService,
  ) {}

  errorMessage() {
    for (let propertyName in this.control.errors) {
      if (this.control.errors.hasOwnProperty(propertyName)) {
        return this.validationService.getValidatorErrorMessage(propertyName, this.control.errors[propertyName]);
      }
    }

    return null;
  }
}
