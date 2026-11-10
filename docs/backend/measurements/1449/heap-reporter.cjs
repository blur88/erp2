const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
class HeapReporter {
  constructor() {
    this.file = process.env.HEAP_REPORT;
    this.workers = new Set();
    this.rows = [];
    this.resultPids = new Map();
    this.originalFork = cp.fork;
    this.emit = (row) => fs.appendFileSync(this.file, JSON.stringify({time: new Date().toISOString(), ...row}) + '\n');
    this.emit({event:'start', mainPid:process.pid, gc:typeof global.gc, node:process.version, hostname:os.hostname(), cpus:os.cpus().map(c=>c.model), totalMemory:os.totalmem()});
    const self = this;
    cp.fork = function(modulePath, ...args) {
      const child = self.originalFork.call(this, modulePath, ...args);
      if (String(modulePath).includes('jest-worker') && String(modulePath).includes('processChild')) {
        self.workers.add(child.pid);
        self.emit({event:'worker', pid:child.pid, modulePath});
        child.on('message', message => {
          const result = Array.isArray(message) ? message[1] : undefined;
          if (result && result.testFilePath && typeof result.memoryUsage === 'number') {
            self.resultPids.set(result.testFilePath, child.pid);
            self.emit({event:'worker-result', pid:child.pid, file:result.testFilePath, heapBytes:result.memoryUsage});
          }
        });
        child.on('exit', (code,signal)=>self.emit({event:'worker-exit',pid:child.pid,code,signal}));
      }
      return child;
    };
    this.timer = setInterval(()=> {
      const samples=[];
      for (const pid of [process.pid,...this.workers]) {
        try {
          const status=fs.readFileSync(`/proc/${pid}/status`,'utf8');
          samples.push({pid,rssKiB:Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0)});
        } catch {}
      }
      self.emit({event:'sample',loadavg:os.loadavg(),samples});
    },1000);
    this.timer.unref();
  }
  onTestResult(test,result) {
    const row={event:'suite', file:path.relative(process.cwd(),result.testFilePath), heapBytes:result.memoryUsage, executionPid:this.workers.size ? this.resultPids.get(result.testFilePath) : process.pid, failed:result.numFailingTests, passed:result.numPassingTests};
    this.rows.push(row);
    this.emit(row);
    console.log(`HEAP ${this.rows.length} ${(row.heapBytes/1048576).toFixed(2)} MiB ${row.file}`);
  }
  onRunComplete(contexts,results) {
    clearInterval(this.timer);
    cp.fork=this.originalFork;
    this.emit({event:'complete',peakHeapBytes:Math.max(...this.rows.map(r=>r.heapBytes || 0)),workerPids:[...this.workers],restarts:Math.max(0,this.workers.size-1),suites:results.numTotalTestSuites,passedSuites:results.numPassedTestSuites,failedSuites:results.numFailedTestSuites,tests:results.numTotalTests,failedTests:results.numFailedTests});
  }
}
module.exports=HeapReporter;
