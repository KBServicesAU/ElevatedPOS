package com.elevatedpos.tyrotta;

public class PosProductData {
    private final String posProductVendor;
    private final String posProductName;
    private final String posProductVersion;

    public PosProductData(String posProductVendor, String posProductName, String posProductVersion) {
        this.posProductVendor = posProductVendor;
        this.posProductName = posProductName;
        this.posProductVersion = posProductVersion;
    }

    public String getPosProductVendor() {
        return posProductVendor;
    }

    public String getPosProductName() {
        return posProductName;
    }

    public String getPosProductVersion() {
        return posProductVersion;
    }
}
