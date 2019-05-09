import { Component } from '@angular/core';
import { ConstantsService } from '../../providers/constants.service';

@Component({
  selector: 'app-stripe-approve',
  templateUrl: './stripe-approve.component.html',
  styleUrls: ['./stripe-approve.component.scss'],
})
export class StripeApproveComponent {
  constructor(
    public constants: ConstantsService) {
  }
}
