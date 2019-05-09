import { Component } from '@angular/core';
import { ConstantsService } from '../../providers/constants.service';

@Component({
  selector: 'app-stripe-deny',
  templateUrl: './stripe-deny.component.html',
  styleUrls: ['./stripe-deny.component.scss'],
})
export class StripeDenyComponent {
  constructor(
    public constants: ConstantsService) {
  }
}
