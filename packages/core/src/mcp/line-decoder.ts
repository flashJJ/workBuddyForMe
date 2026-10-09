import { StringDecoder } from 'node:string_decoder';

/** 按行分帧解码（处理 chunk 边界与 CRLF） */
export class LineDecoder {
  private decoder = new StringDecoder('utf8');
  private buffer = '';

  push(chunk: Buffer): string[] {
    this.buffer += this.decoder.write(chunk);
    return this.flushLines(false);
  }

  end(chunk?: Buffer): string[] {
    if (chunk) this.buffer += this.decoder.end(chunk);
    else this.buffer += this.decoder.end();
    return this.flushLines(true);
  }

  private flushLines(final: boolean): string[] {
    const lines: string[] = [];
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      lines.push(this.buffer.slice(0, index).replace(/\r$/, ''));
      this.buffer = this.buffer.slice(index + 1);
      index = this.buffer.indexOf('\n');
    }
    if (final && this.buffer) {
      lines.push(this.buffer.replace(/\r$/, ''));
      this.buffer = '';
    }
    return lines;
  }
}
