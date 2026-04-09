package com.elevatedpos.tyrotta;

public enum IclientSource {
    PRODUCTION("https://iclient.tyro.com"),
    TEST("https://iclient.test.tyro.com"),
    SIMULATOR("https://iclientsimulator.test.tyro.com");

    private String url;

    IclientSource(String url) {
        this.url = url;
    }

    public String getUrl() {
        return url;
    }
}
