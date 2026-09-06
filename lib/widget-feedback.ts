"use client";

import { createContext } from "react";

export const WidgetFeedbackContext = createContext<(() => void) | null>(null);
