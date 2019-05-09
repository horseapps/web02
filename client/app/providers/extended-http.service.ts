import { Injectable } from '@angular/core';
import { Request, XHRBackend, RequestOptions, Response, Http, RequestOptionsArgs, Headers } from '@angular/http';
import { Router } from '@angular/router';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/catch';
import 'rxjs/add/observable/throw';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/observable/fromPromise';

import { ConstantsService } from './constants.service';

declare var window: any;

@Injectable()
export class ExtendedHttpService extends Http {

  constructor(
    private backend: XHRBackend,
    private router: Router,
    private toastr: ToastsManager,
    options: RequestOptions,
    private constants: ConstantsService,
  ) {
    super(backend, options);
    const token = localStorage.token;
    options.headers.set('Authorization', `Bearer ${token}`);
    this.initAnalytics();
  }

  request(url: string|Request, options?: RequestOptionsArgs): Observable<any> {
    const token = localStorage.token;

    // we have to add the token to the options, not in url
    if (typeof url === 'string') {
      if (!options) {
        // make option object
        options = { headers: new Headers() };
      }
      options.headers.set('Authorization', `Bearer ${token}`);
    } else {
      // add the token to the url object
      url.headers.set('Authorization', `Bearer ${token}`);
    }
    return super.request(url, options).catch(this.responseError(this));
  }

  private responseError(self: ExtendedHttpService) {
    // pass HttpService's own instance here as `self`
    return (res: Response) => {
      if (res.status === 401) {
        localStorage.removeItem('token');
        this.toastr.error('You are not logged in', 'Whoops!');
        this.router.navigate(['/auth/login']);
      }

      if (res.status === 403) {
        this.toastr.error('You are not authorized to view that', 'Whoops!');
        this.router.navigate(['/auth/login']);
      }

      return Observable.throw(res);
    };
  }

  private initAnalytics(): void {
    if (!!window.ga) {
      console.log('Google Analytics: Tracking with ID: ', this.constants.GOOGLE_ANALYTICS_TRACKING_ID);
      window.ga('create', this.constants.GOOGLE_ANALYTICS_TRACKING_ID, 'auto');
    } else {
      console.log('Google Analytics Unavailable');
    }
  }
}
