import React from "react";

import { Alert } from "../ui/alert";

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container mx-auto px-4 sm:px-6 py-6">
          <Alert variant="destructive">
            Something went wrong while rendering this page. Refresh the page or navigate back to
            continue.
          </Alert>
        </div>
      );
    }
    return this.props.children;
  }
}
