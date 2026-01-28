import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
// Define una interfaz para los datos que esperas recibir
// Ajusta esto según la estructura real de tu backend

interface RealTimeData {
  value: number;
  timestamp: number | string;
  // otras propiedades...
}
@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private socket!: WebSocket;
  private readonly WS_URL = 'wss://sasoftly.com/emit';
  private messagesSubject = new Subject<RealTimeData>();
  public readonly messages$: Observable<RealTimeData> = this.messagesSubject
    .asObservable()
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  constructor() {
    this.connect();
  }
  private connect(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('El socket ya está abierto.');
      return;
    }
    try {
      this.socket = new WebSocket(this.WS_URL);
      this.socket.onopen = () => {
        console.log(
          ':marca_de_verificación_blanca: WebSocket conectado a:',
          this.WS_URL,
        );
      };
      this.socket.onmessage = (event) => {
        try {
          const data: RealTimeData = JSON.parse(event.data);
          this.messagesSubject.next(data);
        } catch (e) {
          console.error(
            'Error al parsear el mensaje del WebSocket:',
            event.data,
            e,
          );
        }
      };
      this.socket.onerror = (error) => {
        console.error(':luz_giratoria: Error de WebSocket:', error);
      };
      this.socket.onclose = () => {
        console.warn(
          ':x: WebSocket desconectado. Intentando reconectar en 5 segundos...',
        );
        // Lógica de reconexión
        setTimeout(() => this.connect(), 5000);
      };
    } catch (e) {
      console.error('No se pudo inicializar WebSocket:', e);
    }
  }
  /**
   * Envía datos al servidor WebSocket.
   * @param message El objeto a enviar (se convertirá a JSON).
   */
  public send(message: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('No se pudo enviar el mensaje. Socket no conectado.');
    }
  }
}
