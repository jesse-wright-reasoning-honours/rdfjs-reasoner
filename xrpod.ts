import { range, AsyncIterator , union} from 'asynciterator'

class XProd<A, B, C> extends AsyncIterator<C> {
  private i: number;
  private item: B | null = null;
  private setReadable = () => {
    if (this.readable)
      this.emit('readable');
    else
      this.readable = true;
  };
  constructor(private arr: A[], private iter: AsyncIterator<B>, private f: (a: A, b: B) => C) {
    super()
    this.i = arr.length - 1;
    iter.on('readable', this.setReadable);
    iter.on('end', this.setReadable);
  }

  close() {
    this.iter.removeListener('readable', this.setReadable);
    this.iter.removeListener('end', this.setReadable);
    super.close();
  }

  read(): C | null {
    if (this.i === this.arr.length - 1) {
      if ((this.item = this.iter.read()) === null) {
        if (this.iter.done) {
          this.close();
        }
        return null;
      }
      this.i = -1;
    }
    return this.f(this.arr[++this.i], this.item!)
  }
}

const xp = new XProd(['a', 'b'], union([range(1, 5), range(10, 11)]), (a, b) => `${a}-${b}`);

(async () => {
  console.log(await xp.toArray())
})()
