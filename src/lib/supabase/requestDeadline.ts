/** Bound optional account requests without gating the planner. Never logs request data. */
export function withDeadline<T>(operation: Promise<T>, onTimeout?: () => void, milliseconds = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error('Account service is taking too long. Try again; trip planning is still available.'));
    }, milliseconds);
    operation.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
