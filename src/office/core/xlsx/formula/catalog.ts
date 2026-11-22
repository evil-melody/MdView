/**
 * Function catalog for the formula editor (autocomplete + argument hints).
 * Kept separate from the implementations so the UI bundle stays small.
 * Format: `NAME: 'arg1, [arg2], ...|Description'`.
 */
const RAW: Record<string, string> = {
  ABS: 'number|Absolute value of a number.',
  AND: 'logical1, [logical2], ...|TRUE if all arguments are TRUE.',
  AVERAGE: 'number1, [number2], ...|Arithmetic mean of the arguments.',
  AVERAGEIF: 'range, criteria, [average_range]|Average of cells that meet a condition.',
  AVERAGEIFS: 'average_range, criteria_range1, criteria1, ...|Average of cells that meet multiple conditions.',
  CEILING: 'number, significance|Rounds a number up to the nearest multiple of significance.',
  'CEILING.MATH': 'number, [significance], [mode]|Rounds a number up to the nearest integer or multiple.',
  CHAR: 'number|Character for a character code.',
  CHOOSE: 'index_num, value1, [value2], ...|Picks a value from the list by position.',
  CODE: 'text|Numeric code of the first character.',
  COLUMN: '[reference]|Column number of a reference.',
  COLUMNS: 'array|Number of columns in a reference.',
  CONCAT: 'text1, [text2], ...|Joins several text items into one.',
  CONCATENATE: 'text1, [text2], ...|Joins several text items into one.',
  COUNT: 'value1, [value2], ...|Counts cells that contain numbers.',
  COUNTA: 'value1, [value2], ...|Counts cells that are not empty.',
  COUNTBLANK: 'range|Counts empty cells in a range.',
  COUNTIF: 'range, criteria|Counts cells that meet a condition.',
  COUNTIFS: 'criteria_range1, criteria1, ...|Counts cells that meet multiple conditions.',
  DATE: 'year, month, day|Date serial number from year, month and day.',
  DATEDIF: 'start_date, end_date, unit|Difference between two dates in days, months or years.',
  DAY: 'serial_number|Day of the month (1-31).',
  DAYS: 'end_date, start_date|Number of days between two dates.',
  EDATE: 'start_date, months|Date that is a number of months before or after a date.',
  EOMONTH: 'start_date, months|Last day of the month, months before or after a date.',
  'ERROR.TYPE': 'error_val|Number that corresponds to an error type.',
  EVEN: 'number|Rounds up to the nearest even integer.',
  EXACT: 'text1, text2|TRUE if two texts are exactly the same.',
  EXP: 'number|e raised to the power of a number.',
  FACT: 'number|Factorial of a number.',
  FALSE: '|The logical value FALSE.',
  PMT: 'rate, nper, pv, [fv], [type]|Payment for a constant-rate loan.',
  FV: 'rate, nper, pmt, [pv], [type]|Future value of an investment.',
  PV: 'rate, nper, pmt, [fv], [type]|Present value of an investment.',
  NPER: 'rate, pmt, pv, [fv], [type]|Number of periods for an investment.',
  RATE: 'nper, pmt, pv, [fv], [type], [guess]|Interest rate per period of an annuity.',
  NPV: 'rate, value1, [value2], ...|Net present value of a series of cash flows.',
  IRR: 'values, [guess]|Internal rate of return of a series of cash flows.',
  FIND: 'find_text, within_text, [start_num]|Position of a text inside another (case-sensitive).',
  FLOOR: 'number, significance|Rounds a number down to the nearest multiple of significance.',
  'FLOOR.MATH': 'number, [significance], [mode]|Rounds a number down to the nearest integer or multiple.',
  GCD: 'number1, [number2], ...|Greatest common divisor.',
  HLOOKUP: 'lookup_value, table_array, row_index_num, [range_lookup]|Looks up a value in the top row and returns a value from the same column.',
  HOUR: 'serial_number|Hour of a time value (0-23).',
  HYPERLINK: 'link_location, [friendly_name]|A link: the cell shows the friendly name, or else the address.',
  IF: 'logical_test, [value_if_true], [value_if_false]|Returns one value if a condition is TRUE and another if FALSE.',
  IFERROR: 'value, value_if_error|Returns value_if_error if the expression is an error.',
  IFNA: 'value, value_if_na|Returns value_if_na if the expression is #N/A.',
  IFS: 'logical_test1, value_if_true1, ...|Returns the value of the first TRUE condition.',
  INDEX: 'array, row_num, [column_num]|Value at a given row and column of a range.',
  INDIRECT: 'ref_text, [a1]|Reference given by a text string.',
  INT: 'number|Rounds down to the nearest integer.',
  ISBLANK: 'value|TRUE if the value is empty.',
  ISERR: 'value|TRUE if the value is an error other than #N/A.',
  ISERROR: 'value|TRUE if the value is any error.',
  ISEVEN: 'number|TRUE if the number is even.',
  ISLOGICAL: 'value|TRUE if the value is a logical value.',
  ISNA: 'value|TRUE if the value is #N/A.',
  ISNONTEXT: 'value|TRUE if the value is not text.',
  ISNUMBER: 'value|TRUE if the value is a number.',
  ISODD: 'number|TRUE if the number is odd.',
  ISTEXT: 'value|TRUE if the value is text.',
  LARGE: 'array, k|k-th largest value in a data set.',
  LCM: 'number1, [number2], ...|Least common multiple.',
  LEFT: 'text, [num_chars]|First characters of a text.',
  LEN: 'text|Number of characters in a text.',
  LN: 'number|Natural logarithm.',
  LOG: 'number, [base]|Logarithm to a given base (default 10).',
  LOG10: 'number|Base-10 logarithm.',
  LOOKUP: 'lookup_value, lookup_vector, [result_vector]|Looks up a value in a one-row or one-column range.',
  LOWER: 'text|Converts text to lowercase.',
  MATCH: 'lookup_value, lookup_array, [match_type]|Relative position of a value in a range.',
  MAX: 'number1, [number2], ...|Largest value.',
  MAXIFS: 'max_range, criteria_range1, criteria1, ...|Largest value among cells that meet conditions.',
  MEDIAN: 'number1, [number2], ...|Median of the numbers.',
  MID: 'text, start_num, num_chars|Characters from the middle of a text.',
  MIN: 'number1, [number2], ...|Smallest value.',
  MINIFS: 'min_range, criteria_range1, criteria1, ...|Smallest value among cells that meet conditions.',
  MINUTE: 'serial_number|Minute of a time value (0-59).',
  MOD: 'number, divisor|Remainder after division.',
  MODE: 'number1, [number2], ...|Most frequent value.',
  'MODE.SNGL': 'number1, [number2], ...|Most frequent value.',
  MONTH: 'serial_number|Month of a date (1-12).',
  N: 'value|Value converted to a number.',
  NA: '|The error value #N/A.',
  NETWORKDAYS: 'start_date, end_date, [holidays]|Number of working days between two dates.',
  NOT: 'logical|Reverses a logical value.',
  NOW: '|Current date and time.',
  ODD: 'number|Rounds up to the nearest odd integer.',
  OFFSET: 'reference, rows, cols, [height], [width]|Reference offset from a starting reference.',
  OR: 'logical1, [logical2], ...|TRUE if any argument is TRUE.',
  PI: '|The value of pi.',
  POWER: 'number, power|A number raised to a power.',
  PRODUCT: 'number1, [number2], ...|Multiplies all the arguments.',
  PROPER: 'text|Capitalizes the first letter of each word.',
  RAND: '|Random number between 0 and 1.',
  RANDBETWEEN: 'bottom, top|Random integer between two numbers.',
  RANK: 'number, ref, [order]|Rank of a number in a list.',
  'RANK.EQ': 'number, ref, [order]|Rank of a number in a list.',
  REPLACE: 'old_text, start_num, num_chars, new_text|Replaces part of a text by position.',
  REPT: 'text, number_times|Repeats a text a number of times.',
  RIGHT: 'text, [num_chars]|Last characters of a text.',
  ROUND: 'number, num_digits|Rounds a number to a number of digits.',
  ROUNDDOWN: 'number, num_digits|Rounds a number down, toward zero.',
  ROUNDUP: 'number, num_digits|Rounds a number up, away from zero.',
  ROW: '[reference]|Row number of a reference.',
  ROWS: 'array|Number of rows in a reference.',
  SEARCH: 'find_text, within_text, [start_num]|Position of a text inside another (not case-sensitive).',
  SECOND: 'serial_number|Second of a time value (0-59).',
  SIGN: 'number|Sign of a number: 1, 0 or -1.',
  SMALL: 'array, k|k-th smallest value in a data set.',
  SQRT: 'number|Square root.',
  STDEV: 'number1, [number2], ...|Standard deviation of a sample.',
  'STDEV.P': 'number1, [number2], ...|Standard deviation of a population.',
  'STDEV.S': 'number1, [number2], ...|Standard deviation of a sample.',
  STDEVP: 'number1, [number2], ...|Standard deviation of a population.',
  SUBSTITUTE: 'text, old_text, new_text, [instance_num]|Replaces existing text with new text.',
  SUM: 'number1, [number2], ...|Adds all the numbers.',
  SUMIF: 'range, criteria, [sum_range]|Adds the cells that meet a condition.',
  SUMIFS: 'sum_range, criteria_range1, criteria1, ...|Adds the cells that meet multiple conditions.',
  SUMPRODUCT: 'array1, [array2], ...|Sum of the products of corresponding items.',
  SWITCH: 'expression, value1, result1, [default_or_value2], ...|Matches an expression against a list of values.',
  T: 'value|Text of a value, or empty text.',
  TEXT: 'value, format_text|Formats a number as text.',
  TEXTJOIN: 'delimiter, ignore_empty, text1, ...|Joins texts with a delimiter.',
  TIME: 'hour, minute, second|Time value from hour, minute and second.',
  TODAY: '|Current date.',
  TRIM: 'text|Removes extra spaces from text.',
  TRUE: '|The logical value TRUE.',
  TRUNC: 'number, [num_digits]|Truncates a number to an integer or number of digits.',
  UPPER: 'text|Converts text to uppercase.',
  VALUE: 'text|Converts text to a number.',
  VAR: 'number1, [number2], ...|Variance of a sample.',
  'VAR.P': 'number1, [number2], ...|Variance of a population.',
  'VAR.S': 'number1, [number2], ...|Variance of a sample.',
  VARP: 'number1, [number2], ...|Variance of a population.',
  VLOOKUP: 'lookup_value, table_array, col_index_num, [range_lookup]|Looks up a value in the first column and returns a value from the same row.',
  WEEKDAY: 'serial_number, [return_type]|Day of the week of a date.',
  XLOOKUP: 'lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode]|Searches a range and returns the matching item from another range.',
  XOR: 'logical1, [logical2], ...|TRUE if an odd number of arguments are TRUE.',
  YEAR: 'serial_number|Year of a date.',
}

export interface FnInfo {
  name: string
  args: string[]
  /** last argument repeats (`...`) */
  variadic: boolean
  desc: string
}

let cache: FnInfo[] | null = null

/** All functions offered to the user, sorted by name. */
export function functionCatalog(): FnInfo[] {
  if (!cache) {
    cache = Object.keys(RAW)
      .sort()
      .map((name) => {
        const [sig, desc] = RAW[name].split('|')
        const parts = sig ? sig.split(', ') : []
        const variadic = parts[parts.length - 1] === '...'
        return { name, args: variadic ? parts.slice(0, -1) : parts, variadic, desc }
      })
  }
  return cache
}

export function functionInfo(name: string): FnInfo | undefined {
  const up = name.toUpperCase()
  return functionCatalog().find((f) => f.name === up)
}

/** Functions whose name starts with `prefix` (case-insensitive). */
export function suggestFunctions(prefix: string, limit = 10): FnInfo[] {
  const up = prefix.toUpperCase()
  if (!up) return []
  return functionCatalog()
    .filter((f) => f.name.startsWith(up))
    .slice(0, limit)
}

/** Index of the signature argument to highlight for the `arg`-th (0-based) argument being typed. */
export function argSlot(f: FnInfo, arg: number): number {
  if (arg < f.args.length) return arg
  if (!f.variadic) return -1
  // repeating group: e.g. SUMIFS(sum_range, criteria_range1, criteria1, ...) repeats the last 2,
  // SUM(number1, [number2], ...) repeats the last one
  const n = f.args.length
  const pairs = /1$/.test(f.args[n - 1] ?? '') && /1$/.test(f.args[n - 2] ?? '') ? 2 : 1
  const start = n - pairs
  return start + ((arg - start) % pairs)
}
