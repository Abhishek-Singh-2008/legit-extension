// ─── Complexity Analyzer Audit Test Suite ─────────────────────────────────────

import { analyzeComplexity } from "@/complexity/analyzer";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

export function runAuditTests(): void {
  console.log("Running Final Production Audit Test Suite...");

  // TEST 1: Single linear loop -> O(n) time, O(1) space
  const test1 = analyzeComplexity(
    `
for i in range(n):
    print(i)
    `,
    "python3"
  );
  assert(test1.time === "O(n)", `TEST 1 Time expected O(n), got ${test1.time}`);
  assert(test1.space === "O(1)", `TEST 1 Space expected O(1), got ${test1.space}`);

  // TEST 2: Nested loops -> O(n²) time, O(1) space
  const test2 = analyzeComplexity(
    `
for i in range(n):
    for j in range(n):
        print(i, j)
    `,
    "python3"
  );
  assert(test2.time === "O(n²)", `TEST 2 Time expected O(n²), got ${test2.time}`);
  assert(test2.space === "O(1)", `TEST 2 Space expected O(1), got ${test2.space}`);

  // TEST 3: Logarithmic multiplication loop -> O(log n) time, O(1) space
  const test3 = analyzeComplexity(
    `
i = 1
while i < n:
    i *= 2
    `,
    "python3"
  );
  assert(test3.time === "O(log n)", `TEST 3 Time expected O(log n), got ${test3.time}`);
  assert(test3.space === "O(1)", `TEST 3 Space expected O(1), got ${test3.space}`);

  // TEST 4: Sequential linear loops over same bound n -> O(n) time (NOT O(n²))
  const test4 = analyzeComplexity(
    `
for i in range(n):
    pass
for j in range(n):
    pass
    `,
    "python3"
  );
  assert(test4.time === "O(n)", `TEST 4 Time expected O(n), got ${test4.time}`);
  assert(test4.time !== "O(n²)", `TEST 4 Time should NOT be O(n²)`);

  // TEST 5: Linear allocation list append -> O(n) time, O(n) space
  const test5 = analyzeComplexity(
    `
result = []
for x in arr:
    result.append(x)
    `,
    "python3"
  );
  assert(test5.time === "O(n)", `TEST 5 Time expected O(n), got ${test5.time}`);
  assert(test5.space === "O(n)", `TEST 5 Space expected O(n), got ${test5.space}`);

  // TEST 6: Linear recursion -> O(n) time, O(n) space
  const test6 = analyzeComplexity(
    `
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
    `,
    "python3"
  );
  assert(test6.time === "O(n)", `TEST 6 Time expected O(n), got ${test6.time}`);
  assert(test6.space === "O(n)", `TEST 6 Space expected O(n), got ${test6.space}`);

  // TEST 7: Exponential branching recursion -> O(2^n) time, O(n) space
  const test7 = analyzeComplexity(
    `
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)
    `,
    "python3"
  );
  assert(test7.time === "O(2^n)", `TEST 7 Time expected O(2^n), got ${test7.time}`);
  assert(test7.space === "O(n)", `TEST 7 Space expected O(n), got ${test7.space}`);

  // Additional Edge Case 1: Built-in Sorting -> O(n log n)
  const testSort = analyzeComplexity("nums.sort()", "python3");
  assert(testSort.time === "O(n log n)", `Sorting Time expected O(n log n), got ${testSort.time}`);

  // Additional Edge Case 2: HashMap / Dict -> O(1) time, O(n) space
  const testMap = analyzeComplexity("d = dict()\nd[x] = 1", "python3");
  assert(testMap.space === "O(n)", `Dict Space expected O(n), got ${testMap.space}`);

  // Additional Edge Case 3: Unsupported language -> Safe fallback without crash
  const testUnsup = analyzeComplexity("xyz abc", "brainfuck");
  assert(testUnsup.time === "O(1)", `Unsupported lang time expected O(1), got ${testUnsup.time}`);
  assert(testUnsup.confidence === "high" || testUnsup.confidence === "low", "Confidence valid");

  // Additional Edge Case 4: Malformed code / empty -> Safe fallback
  const testMalformed = analyzeComplexity("(((", "python3");
  assert(typeof testMalformed.time === "string", "Malformed code handled safely");

  console.log("All Audit Test Suite cases passed successfully!");
}
