import { Injectable } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

@Injectable()
export class ValidationService {

  /**
   * The server returns mongoose formatted errors (object with property names and errors)
   * Get the property name from the error and match it to a control
   * @param {FormGroup} form The form to add errors
   * @param {object} errors Error object from server
   */
  buildServerErrors(form: FormGroup, errors: any) {
    const serverErrors = errors.errors;
    for (let error in serverErrors) {
      if (serverErrors.hasOwnProperty(error)) {
        // Any arrays will come back as something like "products.1.productName"
        // We are guaranteed that there will be three elements when we split
        const split = error.split('.');
        if (split.length === 3) {
          // Add the error to both the sub control as well as the parent control
          form.get(split[0]).get(split[1]).get(split[2]).setErrors({ server: serverErrors[error].message });
          form.get(split[0]).setErrors({ server: serverErrors[error].message });
        } else {
          if (form.get(error) && typeof form.controls[error].setErrors === 'function') {
            form.get(error).setErrors({ server: serverErrors[error].message });
          }
        }
      }
    }
  }

  getValidatorErrorMessage(validatorName: string, validatorValue?: any) {
    const validationMessages: {} = {
      'required': 'Required',
      'invalidCreditCard': 'Is invalid credit card number',
      'invalidEmailAddress': 'Invalid email address',
      'invalidPassword': 'Invalid password. Password must be at least 6 characters long, and contain a number.',
      'minlength': `Minimum length ${validatorValue.requiredLength}`,
      'server': `${validatorValue || 'Not valid'}`,
    };

    return validationMessages[validatorName];
  }

  creditCardValidator(control: FormControl) {
    // Visa, MasterCard, American Express, Diners Club, Discover, JCB
    if (control.value && control.value.match(/^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})$/)) {
      return null;
    } else {
      return { 'invalidCreditCard': true };
    }
  }

  emailValidator(control: FormControl) {
    // RFC 2822 compliant regex
    if (control.value && control.value.match(/[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/)) {
      return null;
    } else {
      return { 'invalidEmailAddress': true };
    }
  }

  passwordValidator(control: FormControl) {
    // {6,100}           - Assert password is between 6 and 100 characters
    // (?=.*[0-9])       - Assert a string has at least one number
    if (control.value && control.value.match(/^(?=.*[0-9])[a-zA-Z0-9!@#$%^&*]{6,100}$/)) {
      return null;
    } else {
      return { 'invalidPassword': true };
    }
  }
}
