import React from "react";
import { toast } from "sonner";

import { errorMessage } from "../lib/format";

// Surfaces a query's failure as a toast, matching the pre-React-Query behavior
// of the list hooks. Only one page (hence one consumer of a shared query) is
// mounted at a time, so this never double-toasts across pages.
export function useQueryErrorToast(isError: boolean, error: unknown, fallback: string) {
  React.useEffect(() => {
    if (isError) toast.error(errorMessage(error, fallback));
  }, [isError, error, fallback]);
}
