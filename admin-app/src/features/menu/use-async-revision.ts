import { useCallback, useEffect, useRef } from "react";

export function useAsyncRevision() {
  const mounted = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current += 1;
    };
  }, []);

  const begin = useCallback(() => ++revision.current, []);
  const invalidate = useCallback(() => {
    revision.current += 1;
  }, []);
  const isCurrent = useCallback(
    (candidate: number) => mounted.current && candidate === revision.current,
    [],
  );

  return { begin, invalidate, isCurrent };
}
