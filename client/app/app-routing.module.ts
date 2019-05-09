import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { StripeApproveComponent } from './stripe/stripe-approve/stripe-approve.component';
import { StripeDenyComponent } from './stripe/stripe-deny/stripe-deny.component';

const ROUTES: Routes = [
  { path: '', redirectTo: '/admin/User', pathMatch: 'full' },
  { path: 'admin/stripe/approve',  component: StripeApproveComponent },
  { path: 'admin/stripe/deny',  component: StripeDenyComponent },
];

@NgModule({
  imports: [ RouterModule.forRoot(ROUTES) ],
  exports: [ RouterModule ],
})
export class AppRoutingModule { }
