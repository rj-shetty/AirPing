/*!
 * AirPing
 * Copyright (c) 2026 Aayush Gupta. All rights reserved.
 * Source-available for viewing and evaluation only. See LICENSE.
 */

// Single source of the legal notice, shared by the Guide screen and the
// onboarding acceptance popup so the two can never drift apart.

export function legalHtml() {
  return `
    <p>AirPing is an independent, non-commercial application for demonstration purposes. It is not a financial product or service, and it is not affiliated with, endorsed by, or sponsored by NPCI, BHIM, any banking institution, or any telecom operator.</p>
    <p>The application does not hold, transmit, or receive funds. It prepares payment details and hands off to your device's native dialer. All transactions are executed over your carrier's *99# USSD service and your bank's infrastructure, and are authorised solely by you using your UPI PIN.</p>
    <p>The application is provided free of charge, on an "as is" and "as available" basis, without warranties of any kind, express or implied. To the maximum extent permitted by law, the developer accepts no liability for any loss or damage arising from its use, including failed, delayed, or incorrect transfers, carrier charges, or fraud or scams committed by third parties. Any dispute concerning a transaction must be raised with your bank, where the transaction is actually processed.</p>
    <p>By accessing or using this application, you acknowledge that you have read and understood this notice and agree to be bound by it, including the exclusion of liability set out above. If you do not agree, please discontinue use of the application.</p>
  `;
}
