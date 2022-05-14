import { AsyncIterator, range } from 'asynciterator';

class MyIterator<T, K> extends AsyncIterator<T> {
  // private baseMappings: AsyncIterator<Mapping>;
  private iterators: AsyncIterator<T>[];
  private iterator?: AsyncIterator<T>;
  private setReadable = () => {
    if (this.readable)
      this.emit('readable');
    else
      this.readable = true;
  };
  private i = 0;
  constructor(private arr: K[], private f: (elem: K, data: T | null) => AsyncIterator<T>) {
    super()

    if (arr.length < 2)
      throw new Error('Expected at least 2 premises');

    this.iterators = new Array(arr.length - 1);
    this.iterators[0] = this.f(this.arr[0], null);
    this.readable = true;
  }

  process() {
    let changed = true, item: T | null;
    while (changed) {
      changed = false;
      // Build back forward as far as possible
      while (this.i < this.arr.length - 1 && this.iterators[this.i] && (item = this.iterators[this.i].read()) !== null) {
        changed ||= true;
        this.iterators[++this.i] = this.f(this.arr[this.i], item);
      }

      // Backtrack to the last iterator that is not done
      while (this.i >= 0 && this.iterators[this.i] && this.iterators[this.i].done) {
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
      this.iterator?.removeListener('end', this.setReadable);
      this.iterator = this.iterators?.[this.i];
      this.iterator?.on('readable', this.setReadable);
      this.iterator?.on('end', this.setReadable);
    }
  }

  read(): T | null {
    console.log('read called')
    let item: T | null;
    while (this.i !== -1) {
      // console.log(this.i)
      if (this.i === this.arr.length - 1 && this.iterators[this.i] && (item = this.iterators[this.i].read()) !== null) {
        console.log('returning', item)
        return item;
      }

      let changed = false;
      // Build back forward as far as possible
      while (this.i < this.arr.length - 1 && this.iterators[this.i] && (item = this.iterators[this.i].read()) !== null) {
        // console.log('forward', this.i)
        changed ||= true;
        this.iterators[++this.i] = this.f(this.arr[this.i], item);
      }

      // Backtrack to the last iterator that is not done
      while (this.i >= 0 && this.iterators[this.i] && this.iterators[this.i].done) {
        // console.log('back', this.i)
        changed ||= true;
        this.i--;
      }

      // Current strategy to break out when 
      if (!changed)
        break;
    }
    
    return null;
  }
}

const iter = new MyIterator<number, number>([1, 2, 3], (a, b) => range(1, 2));

(async () => {
  // console.log(iter)
  console.log(await iter.toArray());
})();
