export type MidiMessageHandler = (data: Uint8Array) => void;

export class WebMidiInput {
  private access: MIDIAccess | null = null;
  private handler: MidiMessageHandler | null = null;

  async connect(handler: MidiMessageHandler): Promise<boolean> {
    if (!navigator.requestMIDIAccess) return false;
    this.handler = handler;
    this.access = await navigator.requestMIDIAccess();
    this.bind();
    this.access.onstatechange = () => this.bind();
    return true;
  }

  disconnect(): void {
    if (!this.access) return;
    this.access.inputs.forEach(input => {
      input.onmidimessage = null;
    });
    this.access.onstatechange = null;
    this.access = null;
    this.handler = null;
  }

  private bind(): void {
    if (!this.access || !this.handler) return;
    const handler = this.handler;
    this.access.inputs.forEach(input => {
      input.onmidimessage = event => {
        if (event.data) handler(event.data);
      };
    });
  }
}
