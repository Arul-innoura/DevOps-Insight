import React, { createContext, useContext, useState, useEffect } from 'react';

const TestAuthContext = createContext(null);

export const useTestAuth = () => {
    const context = useContext(TestAuthContext);
    if (!context) {
        throw new Error('useTestAuth must be used within TestAuthProvider');
    }
    return context;
};

export const TestAuthProvider = ({ children }) => {
    const [testUser, setTestUser] = useState(null);

    // Load test user from sessionStorage on mount
    useEffect(() => {
        const savedUser = sessionStorage.getItem('testUser');
        if (savedUser) {
            setTestUser(JSON.parse(savedUser));
        }
    }, []);

    const loginAsTest = (role, name) => {
        const user = {
            name: name,
            email: `${role.toLowerCase()}@test.local`,
            role: role,
            isTestUser: true
        };
        setTestUser(user);
        sessionStorage.setItem('testUser', JSON.stringify(user));
    };

    const logoutTest = () => {
        setTestUser(null);
        sessionStorage.removeItem('testUser');
    };

    const isTestAuthenticated = () => {
        return testUser !== null;
    };

    return (
        <TestAuthContext.Provider value={{
            testUser,
            loginAsTest,
            logoutTest,
            isTestAuthenticated
        }}>
            {children}
        </TestAuthContext.Provider>
    );
};
