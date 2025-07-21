const { ethers } = require("hardhat");

/**
 * Gas Measurement Framework for Bonding Curve Operations
 *
 * This framework establishes baseline gas costs for Phase 1 (Solidity-only)
 * to compare against Phase 2 (Rust-enhanced) implementations.
 *
 * Key Operations to Measure:
 * 1. Sigmoid price calculation
 * 2. Token purchase (buy)
 * 3. Token sale (sell)
 * 4. Supply change notifications
 * 5. Parameter updates
 */

class GasMeasurement {
  constructor() {
    this.measurements = new Map();
    this.baselineCosts = new Map();
  }

  /**
   * Record a gas measurement
   */
  record(operation, gasUsed, context = {}) {
    if (!this.measurements.has(operation)) {
      this.measurements.set(operation, []);
    }

    this.measurements.get(operation).push({
      gasUsed: gasUsed.toString(),
      timestamp: Date.now(),
      context,
    });
  }

  /**
   * Calculate statistics for an operation
   */
  getStats(operation) {
    const measurements = this.measurements.get(operation) || [];
    if (measurements.length === 0) return null;

    const gasAmounts = measurements.map((m) => parseInt(m.gasUsed));
    const min = Math.min(...gasAmounts);
    const max = Math.max(...gasAmounts);
    const avg = Math.floor(
      gasAmounts.reduce((a, b) => a + b, 0) / gasAmounts.length
    );
    const median = this.calculateMedian(gasAmounts);

    return {
      operation,
      count: measurements.length,
      min,
      max,
      average: avg,
      median,
      total: gasAmounts.reduce((a, b) => a + b, 0),
      measurements: measurements.slice(-5), // Last 5 measurements
    };
  }

  /**
   * Generate comprehensive gas report
   */
  generateReport() {
    const operations = Array.from(this.measurements.keys());
    const report = {
      timestamp: new Date().toISOString(),
      phase: "Phase 1 - Solidity Baseline",
      operations: {},
      summary: {
        totalOperations: 0,
        totalGasUsed: 0,
        mostExpensive: null,
        leastExpensive: null,
      },
    };

    let maxAvg = 0;
    let minAvg = Infinity;
    let maxOp = null;
    let minOp = null;
    let totalGas = 0;

    for (const operation of operations) {
      const stats = this.getStats(operation);
      if (!stats) continue;

      report.operations[operation] = stats;
      report.summary.totalOperations += stats.count;
      totalGas += stats.total;

      if (stats.average > maxAvg) {
        maxAvg = stats.average;
        maxOp = operation;
      }
      if (stats.average < minAvg) {
        minAvg = stats.average;
        minOp = operation;
      }
    }

    report.summary.totalGasUsed = totalGas;
    report.summary.mostExpensive = { operation: maxOp, avgGas: maxAvg };
    report.summary.leastExpensive = { operation: minOp, avgGas: minAvg };

    return report;
  }

  /**
   * Print formatted gas report to console
   */
  printReport() {
    const report = this.generateReport();

    console.log("\n" + "=".repeat(80));
    console.log("🔥 GAS USAGE BASELINE REPORT - PHASE 1 (SOLIDITY)");
    console.log("=".repeat(80));

    console.log(`📅 Generated: ${report.timestamp}`);
    console.log(
      `📊 Total Operations Measured: ${report.summary.totalOperations}`
    );
    console.log(
      `⛽ Total Gas Used: ${report.summary.totalGasUsed.toLocaleString()}`
    );

    if (report.summary.mostExpensive) {
      console.log(
        `🔴 Most Expensive: ${
          report.summary.mostExpensive.operation
        } (${report.summary.mostExpensive.avgGas.toLocaleString()} gas avg)`
      );
    }
    if (report.summary.leastExpensive) {
      console.log(
        `🟢 Least Expensive: ${
          report.summary.leastExpensive.operation
        } (${report.summary.leastExpensive.avgGas.toLocaleString()} gas avg)`
      );
    }

    console.log("\n📋 DETAILED BREAKDOWN:");
    console.log("-".repeat(80));

    for (const [operation, stats] of Object.entries(report.operations)) {
      console.log(`\n🔧 ${operation.toUpperCase()}`);
      console.log(`   Measurements: ${stats.count}`);
      console.log(`   Average: ${stats.average.toLocaleString()} gas`);
      console.log(
        `   Range: ${stats.min.toLocaleString()} - ${stats.max.toLocaleString()} gas`
      );
      console.log(`   Median: ${stats.median.toLocaleString()} gas`);

      // Show context if available
      const lastMeasurement = stats.measurements[stats.measurements.length - 1];
      if (lastMeasurement && Object.keys(lastMeasurement.context).length > 0) {
        console.log(
          `   Last Context: ${JSON.stringify(lastMeasurement.context)}`
        );
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log(
      "📝 Note: These are Phase 1 baseline costs using Solidity approximations."
    );
    console.log(
      "   Phase 2 Rust implementation should show significant improvements."
    );
    console.log("=".repeat(80));
  }

  /**
   * Save report to file for later comparison
   */
  async saveReport(filename = `gas-baseline-${Date.now()}.json`) {
    const fs = require("fs").promises;
    const report = this.generateReport();

    try {
      await fs.writeFile(filename, JSON.stringify(report, null, 2));
      console.log(`📄 Gas report saved to: ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to save report: ${error.message}`);
    }
  }

  /**
   * Compare with previous baseline
   */
  async compareWithBaseline(baselineFile) {
    try {
      const fs = require("fs").promises;
      const baselineData = JSON.parse(await fs.readFile(baselineFile, "utf8"));
      const currentReport = this.generateReport();

      console.log("\n" + "=".repeat(80));
      console.log("📊 BASELINE COMPARISON");
      console.log("=".repeat(80));

      for (const operation of Object.keys(currentReport.operations)) {
        const current = currentReport.operations[operation];
        const baseline = baselineData.operations[operation];

        if (!baseline) {
          console.log(
            `🆕 ${operation}: NEW OPERATION (${current.average} gas)`
          );
          continue;
        }

        const change = current.average - baseline.average;
        const percentChange = ((change / baseline.average) * 100).toFixed(1);
        const emoji = change > 0 ? "📈" : change < 0 ? "📉" : "➡️";

        console.log(
          `${emoji} ${operation}: ${current.average} gas (${
            change > 0 ? "+" : ""
          }${change} / ${percentChange}%)`
        );
      }

      console.log("=".repeat(80));
    } catch (error) {
      console.error(`❌ Failed to compare with baseline: ${error.message}`);
    }
  }

  // Helper method to calculate median
  calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.floor((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  }
}

/**
 * Gas measurement utilities for test integration
 */
class GasTestUtils {
  constructor() {
    this.gasMeasurement = new GasMeasurement();
  }

  /**
   * Measure gas for a contract transaction
   */
  async measureTransaction(operation, txPromise, context = {}) {
    const tx = await txPromise;
    const receipt = await tx.wait();

    this.gasMeasurement.record(operation, receipt.gasUsed, context);

    return {
      gasUsed: receipt.gasUsed,
      txHash: receipt.transactionHash,
    };
  }

  /**
   * Measure gas for a view function using gas estimation
   */
  async measureViewFunction(
    operation,
    contract,
    functionName,
    args = [],
    context = {}
  ) {
    try {
      const estimatedGas = await contract.estimateGas[functionName](...args);
      this.gasMeasurement.record(operation, estimatedGas, context);

      return {
        gasUsed: estimatedGas,
        estimated: true,
      };
    } catch (error) {
      console.warn(
        `⚠️  Could not estimate gas for ${operation}: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Batch measure multiple operations
   */
  async batchMeasure(operations) {
    const results = {};

    for (const { operation, promise, context } of operations) {
      try {
        const result = await this.measureTransaction(
          operation,
          promise,
          context
        );
        results[operation] = result;
        console.log(`✅ ${operation}: ${result.gasUsed.toString()} gas`);
      } catch (error) {
        console.error(`❌ ${operation} failed: ${error.message}`);
        results[operation] = { error: error.message };
      }
    }

    return results;
  }

  /**
   * Generate and print final report
   */
  printFinalReport() {
    this.gasMeasurement.printReport();
  }

  /**
   * Get the measurement instance for advanced usage
   */
  getMeasurement() {
    return this.gasMeasurement;
  }
}

module.exports = {
  GasMeasurement,
  GasTestUtils,
};
