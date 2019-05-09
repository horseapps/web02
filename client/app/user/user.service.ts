import { Injectable } from '@angular/core';
import { Http } from '@angular/http';
import { ConstantsService } from '../providers/constants.service';
import 'rxjs/add/operator/toPromise';

@Injectable()
  export class UserService {

  constructor(
    private http: Http,
    public constants: ConstantsService) {
  }

  get(id: string) {
    return this.http.get(`${this.constants.API_BASE_URL}/users/${id}`)
      .toPromise()
      .then((response) => {
         return response.json();
      });
  }

  create(object: {}) {
    return this.http.post(`${this.constants.API_BASE_URL}/users/signup`, object)
      .toPromise()
      .then((response) => {
        return response.json();
      });
  }

}
