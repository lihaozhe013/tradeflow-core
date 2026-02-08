/**
 * Precision Calculation Tool
 * Based on Decimal.js
 */
import Decimal from "decimal.js";

Decimal.config({
  precision: 20, // 20 significant digits
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 21,
  modulo: Decimal.ROUND_DOWN,
  crypto: false,
});

class DecimalCalculator {
  decimal(value: number | string | Decimal | null | undefined): Decimal {
    if (value === null || value === undefined) return new Decimal(0);
    return new Decimal(value);
  }

  add(a: number | string | Decimal, b: number | string | Decimal): Decimal {
    return this.decimal(a).add(this.decimal(b));
  }

  subtract(
    a: number | string | Decimal,
    b: number | string | Decimal
  ): Decimal {
    return this.decimal(a).sub(this.decimal(b));
  }

  multiply(
    a: number | string | Decimal,
    b: number | string | Decimal
  ): Decimal {
    return this.decimal(a).mul(this.decimal(b));
  }

  divide(a: number | string | Decimal, b: number | string | Decimal): Decimal {
    const divisor = this.decimal(b);
    if (divisor.isZero()) {
      throw new Error("Division by zero");
    }
    return this.decimal(a).div(divisor);
  }

  /**
   * Calculate the total price (quantity × unit price)
   * @param quantity
   * @param unitPrice
   * @returns Total price rounded to five decimal places
   */
  calculateTotalPrice(
    quantity: number | string,
    unitPrice: number | string
  ): number {
    const q = this.decimal(quantity);
    const p = this.decimal(unitPrice);
    const result = q.mul(p);
    return this.toNumber(result, 5);
  }

  /**
   * Calculate balance (total amount - amount paid)
   * @param totalAmount
   * @param paidAmount
   * @returns balance rounded to five decimal places
   */
  calculateBalance(
    totalAmount: number | string,
    paidAmount: number | string
  ): number {
    const total = this.decimal(totalAmount);
    const paid = this.decimal(paidAmount);
    const result = total.sub(paid);
    return this.toNumber(result, 5);
  }

  /**
   * Convert to a number with the specified precision
   * @param decimal
   * @param decimalPlaces Decimal places, default 5 digits (supports 0.00001 precision)
   */
  toNumber(decimal: Decimal, decimalPlaces: number = 5): number {
    return parseFloat(decimal.toFixed(decimalPlaces));
  }

  /**
   * Database Numeric Value Handling - Ensuring Conversion to Numeric Format Before Storage
   * @param value
   * @param decimalPlaces Decimal places, default 5 digits (supports 0.00001 precision)
   * @returns Numbers suitable for database storage
   */
  toDbNumber(
    value: number | string | Decimal,
    decimalPlaces: number = 5
  ): number {
    const decimal = this.decimal(value);
    return this.toNumber(decimal, decimalPlaces);
  }

  /**
   * Calculating SQL Aggregate Results - Safely Handling Aggregate Results That May Be Null
   * @param sqlResult
   * @param defaultValue
   * @param decimalPlaces Decimal places, default 5 digits (supports 0.00001 precision)
   */
  fromSqlResult(
    sqlResult: number | null | undefined | bigint,
    defaultValue: number = 0,
    decimalPlaces: number = 5
  ): number {
    if (sqlResult === null || sqlResult === undefined) {
      return defaultValue;
    }
    // Handle BigInt by converting to string first
    const val = typeof sqlResult === 'bigint' ? sqlResult.toString() : sqlResult;
    const decimal = this.decimal(val);
    return this.toNumber(decimal, decimalPlaces);
  }
}

const decimalCalc = new DecimalCalculator();

export default decimalCalc;
