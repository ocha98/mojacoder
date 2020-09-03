const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

module.exports = (phase) => {
    switch (phase) {
        case PHASE_DEVELOPMENT_SERVER:
            return {
                env: {
                    USER_POOL_REGION: "ap-northeast-1",
                    IDP_DOMAIN: "mojacoder-dev.auth.ap-northeast-1.amazoncognito.com",
                    USER_POOL_ID: "ap-northeast-1_zngPaG8ue",
                    USER_POOL_CLIENT_ID: "mvo4uregqaohgolig9085pr7s",
                    REDIRECT_SIGN_IN: "http://localhost:3000/token",
                    REDIRECT_SIGN_OUT: "http://localhost:3000/",
                    AUTH_COOKIE_DOMAIN: "localhost",
                },
            };
        default:
            return {
                env: {
                    USER_POOL_REGION: "ap-northeast-1",
                    IDP_DOMAIN: "mojacoder-dev.auth.ap-northeast-1.amazoncognito.com",
                    USER_POOL_ID: "ap-northeast-1_zngPaG8ue",
                    USER_POOL_CLIENT_ID: "mvo4uregqaohgolig9085pr7s",
                    REDIRECT_SIGN_IN: "http://localhost:3000/token",
                    REDIRECT_SIGN_OUT: "http://localhost:3000/",
                    AUTH_COOKIE_DOMAIN: "localhost",
                },
            };
    }
};
