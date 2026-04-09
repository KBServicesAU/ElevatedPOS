package com.elevatedpos.tyrotta;

import java.util.Map;

public interface ReceiptReceivedCallback {
    void onReceiptData(Map<String, String> receiptData);
}
