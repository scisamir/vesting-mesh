"use client";
import { useEffect, useState } from "react";
import { Button } from "./layouts/Button";
import Vesting from "./Vesting";
import { BrowserWallet, BlockfrostProvider, MeshTxBuilder } from "@meshsdk/core";

export default function Welcome() {
    const [meshTxBuilder, setMeshTxBuilder] = useState<MeshTxBuilder | null>(null);
    const [userWallet, setUserWallet] = useState<BrowserWallet | null>(null);
    const [blockchainProvider, setBlockchainProvider] = useState<BlockfrostProvider>();

    const setUpLucid = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();

        setBlockchainProvider(new BlockfrostProvider("preprod4XNNKV7AtEG8EjLc0kDwdIVoIVLx1x3F"));

        const txBuilder = new MeshTxBuilder({
            fetcher: blockchainProvider,
            submitter: blockchainProvider
        });

        setMeshTxBuilder(txBuilder);

        // log to be removed
        console.log("Mesh Tx Builder:");
        console.log(txBuilder);
        console.log(meshTxBuilder);
    };

    const connectWallet = async () => {
        const wallet = await BrowserWallet.enable('eternl');
        setUserWallet(wallet);
        
        const balance = await wallet.getBalance();
        console.log(balance);
    }

    useEffect(() => {
        if (meshTxBuilder) {
            connectWallet();
        }
    }, [meshTxBuilder]);

    return (
        <>
            <div className="mt-10 grid grid-cols-1 gap-y-8">
                <Button onClick={setUpLucid} disabled={userWallet ? true  : false}>{userWallet ? "Connected" : "Connect Wallet"}</Button>
            </div>
            {userWallet && (
                <Vesting meshTxBuilder={meshTxBuilder} userWallet={userWallet} setUserWallet={setUserWallet} blockchainProvider={blockchainProvider} />
            )}
        </>
    );
}
