package com.elevatedpos.tyrotta;

import java.util.Map;

public class RequestContext {
    private final String name;
    private final Map<String, Object> params;
    private final ReceiptReceivedCallback receiptReceived;
    private final TransactionCompleteCallback transactionComplete;

    public RequestContext(String name, Map<String, Object> params, ReceiptReceivedCallback receiptReceived, TransactionCompleteCallback transactionComplete) {
        this.name = name;
        this.params = params;
        this.receiptReceived = receiptReceived;
        this.transactionComplete = transactionComplete;
    }

    public String getName() {
        return name;
    }

    public Map<String, Object> getParams() {
        return params;
    }

    public ReceiptReceivedCallback getReceiptReceived() {
        return receiptReceived;
    }

    public TransactionCompleteCallback getTransactionComplete() {
        return transactionComplete;
    }
}
