// ─── Complexity Module Validation Runner ──────────────────────────────────────

import { analyzeComplexity } from "@/complexity/analyzer";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

export function runComplexityModuleTests(): void {
  console.log("Running Complexity Engine Validation Suite...");

  // 1. Constant time O(1) & O(1) space
  const test1 = analyzeComplexity(
    `
    function add(a, b) {
      return a + b;
    }
    `,
    "javascript"
  );
  assert(test1.time === "O(1)", `Test 1 Time expected O(1), got ${test1.time}`);
  assert(test1.space === "O(1)", `Test 1 Space expected O(1), got ${test1.space}`);

  // 2. Single loop O(n) & O(1) space
  const test2 = analyzeComplexity(
    `
    def find_val(arr, target):
        for i in range(len(arr)):
            if arr[i] == target:
                return i
        return -1
    `,
    "python3"
  );
  assert(test2.time === "O(n)", `Test 2 Time expected O(n), got ${test2.time}`);
  assert(test2.space === "O(1)", `Test 2 Space expected O(1), got ${test2.space}`);

  // 3. Two nested loops O(n²) & O(1) space (e.g. print nested loop)
  const test3 = analyzeComplexity(
    `
    for i in range(n):
        for j in range(n):
            print(i, j)
    `,
    "python3"
  );
  assert(test3.time === "O(n²)", `Test 3 Time expected O(n²), got ${test3.time}`);
  assert(test3.space === "O(1)", `Test 3 Space expected O(1), got ${test3.space}`);

  // 4. Three nested loops O(n³)
  const test4 = analyzeComplexity(
    `
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          sum += matrix[i][j][k];
        }
      }
    }
    `,
    "javascript"
  );
  assert(test4.time === "O(n³)", `Test 4 Time expected O(n³), got ${test4.time}`);

  // 5. Logarithmic loop i *= 2 -> O(log n)
  const test5 = analyzeComplexity(
    `
    while (n > 1) {
      n = Math.floor(n / 2);
    }
    `,
    "javascript"
  );
  assert(test5.time === "O(log n)", `Test 5 Time expected O(log n), got ${test5.time}`);

  // 6. Nested linear inside log -> O(n log n)
  const test6 = analyzeComplexity(
    `
    while (n > 1) {
      n = Math.floor(n / 2);
      for (let i = 0; i < len; i++) {
        work(i);
      }
    }
    `,
    "javascript"
  );
  assert(test6.time === "O(n log n)", `Test 6 Time expected O(n log n), got ${test6.time}`);

  // 7. Sequential loops over distinct bounds O(n + m)
  const test7 = analyzeComplexity(
    `
    for x in range(n):
        do_something(x)
    for y in range(m):
        do_something_else(y)
    `,
    "python3"
  );
  assert(test7.time === "O(n + m)", `Test 7 Time expected O(n + m), got ${test7.time}`);

  // 8. Sorting O(n log n)
  const test8 = analyzeComplexity(
    `
    class Solution:
        def sortColors(self, nums):
            nums.sort()
    `,
    "python3"
  );
  assert(test8.time === "O(n log n)", `Test 8 Time expected O(n log n), got ${test8.time}`);

  // 9. Linear search indexOf O(n)
  const test9 = analyzeComplexity(
    `
    function find(arr, item) {
      return arr.indexOf(item);
    }
    `,
    "javascript"
  );
  assert(test9.time === "O(n)", `Test 9 Time expected O(n), got ${test9.time}`);

  // 10. HashMap O(n) auxiliary space
  const test10 = analyzeComplexity(
    `
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            map.put(nums[i], i);
        }
        return new int[0];
    }
    `,
    "java"
  );
  assert(test10.time === "O(n)", `Test 10 Time expected O(n), got ${test10.time}`);
  assert(test10.space === "O(n)", `Test 10 Space expected O(n), got ${test10.space}`);

  // 11. 2D Matrix allocation O(nm) space
  const test11 = analyzeComplexity(
    `
    int[][] dp = new int[n][m];
    `,
    "java"
  );
  assert(test11.space === "O(nm)", `Test 11 Space expected O(nm), got ${test11.space}`);

  // 12. Recursion f(n - 1) + f(n - 2) -> O(2^n) time
  const test12 = analyzeComplexity(
    `
    function fib(n) {
      if (n <= 1) return n;
      return fib(n - 1) + fib(n - 2);
    }
    `,
    "javascript"
  );
  assert(test12.time === "O(2^n)", `Test 12 Time expected O(2^n), got ${test12.time}`);
  assert(test12.space === "O(n)", `Test 12 Space expected O(n), got ${test12.space}`);

  console.log("All Complexity Engine validation tests passed successfully!");
}
