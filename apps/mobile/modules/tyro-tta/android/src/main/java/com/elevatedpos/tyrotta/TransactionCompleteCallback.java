package com.elevatedpos.tyrotta;

import java.util.Map;

public interface TransactionCompleteCallback {
    void onTransactionComplete(Map<String, String> responseData);
}
