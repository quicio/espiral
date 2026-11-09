import type { StatusPort } from '../domain/ports';
import { q } from './render';

export class DomStatus implements StatusPort {
  generative(message: string): void {
    const element = q('#generative-readout');
    if (element) element.textContent = message;
  }

  session(message: string): void {
    const element = q('#session-status');
    if (element) element.textContent = message;
  }

  instrument(message: string): void {
    const element = q('#instrument-status');
    if (element) element.textContent = message;
  }

  error(message: string): void {
    const element = q('#instrument-error');
    if (element) element.textContent = message;
  }
}
