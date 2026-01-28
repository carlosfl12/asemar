import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private http: HttpClient = inject(HttpClient);
  private readonly url = environment.apiUrl;

  getUsername(id: Number) {
    return this.http.get(this.url + `/api/username?user_id=${id}`);
  }
}
