import { Injectable } from '@angular/core';
import { Http, RequestOptions, Headers } from '@angular/http';

// Import RxJs required methods
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';
import 'rxjs/add/operator/toPromise';

import { UserService } from '../user/user.service';
import { ConstantsService } from '../providers/constants.service';

@Injectable()
export class AuthService {
  currentUser: {} = null;

  constructor(
    public http: Http,
    public constants: ConstantsService,
    private userService: UserService,
  ) { }

  login(email: string, password: string) {
    const url = `${this.constants.API_BASE_URL}/auth/login`;
    const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const data = 'email=' + encodeURIComponent(email) + '&password=' + encodeURIComponent(password);
    const options = new RequestOptions({ headers: headers });

    return this.http.post(url, data, options)
      .toPromise()
      .then((response) => {
        const parsedResponse = response.json();

        this.setToken(parsedResponse.token);

        return this.getCurrentUser()
          .then((currentUser) => {
            this.currentUser = currentUser;
          });
      });
  }

  setToken(token: string) {
    return localStorage.setItem('token', token);
  }

  getCurrentUser() {
    return this.userService.get('me');
  }

  logout() {
    localStorage.removeItem('token');
    this.currentUser = null;
  }

  forgotPassword(email: string): Promise<any> {
    const url = `${this.constants.API_BASE_URL}/users/me/forgot`;

    return this.http.put(url, { email })
      .toPromise()
      .then((response) => {
        return response.json();
      });
  }

  resetPassword({ token, password }: { token: string, password: string }) {
    const url = `${this.constants.API_BASE_URL}/users/me/reset/${token}`;

    return this.http.put(url, { password })
      .toPromise()
      .then((response) => {
        return response.json();
      });
  }

  confirmResetToken(token: string) {
    const url = `${this.constants.API_BASE_URL}/users/me/reset/${token}`;
    return this.http.get(url)
      .toPromise()
      .then((response) => {
        return response.json();
      });
  }

  /**
   * If there is a token in local storage, we assume they are logged in
   */
  isAuthenticated() {
    return localStorage.getItem('token');
  }

}
