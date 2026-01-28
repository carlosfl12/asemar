import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class LoginService {
  private http: HttpClient = inject(HttpClient);
  private apiUrl: string = environment.api;

  getLoginToken(user: string, pass: string) {
    return this.http.post(this.apiUrl + '/auth/login', {
      user: user,
      password: pass,
    });
  }
}
