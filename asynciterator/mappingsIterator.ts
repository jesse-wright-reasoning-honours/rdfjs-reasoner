import { AsyncIterator, range } from './asynciterator';

export class ReduceIterator<T, K> extends AsyncIterator<T> {
  // private baseMappings: AsyncIterator<Mapping>;
  private iterators: AsyncIterator<T>[];
  private iterator?: AsyncIterator<T>;
  private setReadable = () => {
    if (this.i !== this.arr.length - 1) {
      this.process();
    } else if (this.readable)
      this.emit('readable');
    else
      this.readable = true;
  };
  private onEnd = () => {
    this.process();
  }
  private i = 0;
  constructor(private arr: K[], private f: (previousValue: T | null, item: K) => AsyncIterator<T>) {
    super()

    if (arr.length < 2)
      throw new Error('Expected at least 2 premises');

    this.iterators = new Array(arr.length - 1);
    this.iterators[0] = this.f(null, this.arr[0]);
    // this.readable = true;
    this.process();
  }

  process() {
    let changed = true, item: T | null;
    while (changed && this.i !== -1) {
      changed = false;
      // Build back forward as far as possible
      while (this.i < this.arr.length - 1 && (item = this.iterators[this.i].read()) !== null) {
        changed ||= true;
        this.iterators[++this.i] = this.f(item, this.arr[this.i]);
      }

      // Backtrack to the last iterator that is not done
      while (this.i >= 0 && this.iterators[this.i].done) {
        changed ||= true;
        this.i--;
      }
    }
    // If i === -1 then the iterator is has finished so close it
    if (this.i === -1 && !this.done) {
      // @ts-ignore
      delete this.iterators;
      this.close();
    }
    if (this.iterator !== this.iterators?.[this.i]) {
      this.iterator?.removeListener('readable', this.setReadable);
      this.iterator?.removeListener('end', this.onEnd);
      this.iterator = this.iterators?.[this.i];
      this.iterator?.on('readable', this.setReadable);
      this.iterator?.on('end', this.onEnd);
    }
    // TODO: See if we need to set readale when iterator is readable and this.i === arr.length - 1
  }

  read(): T | null {
    let item: T | null;
    if (this.i === this.arr.length - 1 && (item = this.iterators[this.i].read()) !== null)
      return item;
    else
      this.process();

    return this.i === this.arr.length - 1 ? this.iterators[this.i].read() : null;
  }
}

// const iter = new ReduceIterator<number, number>([1, 2, 3], (a, b) => range(1, 2));

// (async () => {
//   // console.log(iter)
//   console.log(await iter.toArray());
// })();


