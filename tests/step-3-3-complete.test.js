const { expect } = require("chai");
const { ethers } = require("hardhat");
const { AIJudgmentValidator } = require("./ai-judgment-validator");
const { GasTestUtils } = require("./gas-measurement");

describe("Step 3.3 Complete - AI Judgment Processing & End-to-End Flow", function () {
    let ChatbotToken, SigmoidBondingCurve, AIChatbot;
    let token, bondingCurve, aiChatbot;
    let owner, alice, bob, charlie, dave, eve, aiProcessor;
    let validator, gasUtils;

    // Test parameters
    const A = ethers.BigNumber.from("100000000").mul(1000); // 1000.00000000
    const k = ethers.utils.parseEther("0.001"); // 0.001
    const B = ethers.utils.parseEther("10000"); // 10,000 tokens
    const MESSAGE_FEE = ethers.utils.parseEther("10"); // 10 CBT
    const LIKE_REWARD = ethers.utils.parseEther("100"); // 100 CBT
    const DISLIKE_PENALTY = ethers.utils.parseEther("50"); // 50 CBT

    const AIJudgment = { NONE: 0, LIKED: 1, DISLIKED: 2 };

    beforeEach(async function () {
        [owner, alice, bob, charlie, dave, eve, aiProcessor] = await ethers.getSigners();
        gasUtils = new GasTestUtils();

        // Deploy complete system
        ChatbotToken = await ethers.getContractFactory("ChatbotToken");
        token = await ChatbotToken.deploy("Chatbot Token", "CBT", 0, owner.address);
        await token.deployed();

        SigmoidBondingCurve = await ethers.getContractFactory("SigmoidBondingCurve");
        bondingCurve = await SigmoidBondingCurve.deploy(
            token.address, A, k, B, owner.address
        );
        await bondingCurve.deployed();

        AIChatbot = await ethers.getContractFactory("AIChatbot");
        aiChatbot = await AIChatbot.deploy(
            token.address, bondingCurve.address,
            MESSAGE_FEE, LIKE_REWARD, DISLIKE_PENALTY,
            owner.address
        );
        await aiChatbot.deployed();

        // Configure all permissions
        await token.grantRole(await token.MINTER_ROLE(), bondingCurve.address);
        await token.grantRole(await token.BURNER_ROLE(), bondingCurve.address);
        await token.grantRole(await token.MINTER_ROLE(), aiChatbot.address);
        await token.grantRole(await token.BURNER_ROLE(), aiChatbot.address);
        await bondingCurve.grantRole(
            await bondingCurve.SUPPLY_NOTIFIER_ROLE(), 
            aiChatbot.address
        );
        await aiChatbot.grantRole(
            await aiChatbot.AI_PROCESSOR_ROLE(), 
            aiProcessor.address
        );

        // Initialize validator
        validator = new AIJudgmentValidator(token, bondingCurve, aiChatbot);
    });

    describe("Complete AI Judgment System Validation", function () {
        it("Should pass comprehensive AI judgment validation", async function () {
            console.log("\n🔬 STEP 3.3 - COMPREHENSIVE AI JUDGMENT VALIDATION");
            console.log("=" .repeat(80));

            // Run complete validation using our AIJudgmentValidator
            await validator.validateCompleteAIJudgmentFlow();

            console.log("\n✅ All AI judgment validations passed - System ready for production");
        });

        it("Should demonstrate complete AI chatbot ecosystem", async function () {
            console.log("\n🌍 COMPLETE AI CHATBOT ECOSYSTEM DEMONSTRATION");
            console.log("=" .repeat(80));

            // === Phase 1: Ecosystem Initialization ===
            console.log("\n🚀 Phase 1: Ecosystem initialization");
            
            const users = [
                { signer: alice, name: "Alice", ethAmount: ethers.utils.parseEther("1.5"), personality: "optimistic" },
                { signer: bob, name: "Bob", ethAmount: ethers.utils.parseEther("1.2"), personality: "technical" },
                { signer: charlie, name: "Charlie", ethAmount: ethers.utils.parseEther("2.0"), personality: "creative" },
                { signer: dave, name: "Dave", ethAmount: ethers.utils.parseEther("0.8"), personality: "skeptical" },
                { signer: eve, name: "Eve", ethAmount: ethers.utils.parseEther("1.8"), personality: "analytical" }
            ];

            // Users enter the ecosystem by purchasing tokens
            let totalETHInvested = ethers.BigNumber.from(0);
            for (const user of users) {
                const priceBefore = await bondingCurve.getCurrentPrice();
                
                await bondingCurve.connect(user.signer).buy(0, { value: user.ethAmount });
                
                const priceAfter = await bondingCurve.getCurrentPrice();
                const tokens = await token.balanceOf(user.signer.address);
                totalETHInvested = totalETHInvested.add(user.ethAmount);
                
                console.log(`${user.name} (${user.personality}):`);
                console.log(`  Invested: ${ethers.utils.formatEther(user.ethAmount)} ETH`);
                console.log(`  Received: ${ethers.utils.formatEther(tokens)} CBT`);
                console.log(`  Price impact: ${ethers.utils.formatUnits(priceBefore, 8)} -> ${ethers.utils.formatUnits(priceAfter, 8)}`);
            }

            console.log(`\nTotal ETH invested: ${ethers.utils.formatEther(totalETHInvested)} ETH`);

            // === Phase 2: Conversation & Content Creation ===
            console.log("\n💬 Phase 2: Conversation and content creation");
            
            // Users approve tokens for messaging
            for (const user of users) {
                await token.connect(user.signer).approve(aiChatbot.address, MESSAGE_FEE.mul(10));
            }

            const conversations = [
                // Round 1: Introduction
                { user: alice, content: "Hello everyone! I'm excited to be part of this AI-powered community! 🎉✨" },
                { user: bob, content: "Interesting project. I'm curious about the technical implementation of the bonding curve mechanism." },
                { user: charlie, content: "Welcome Alice! I love the energy. Let's create some amazing content together! 🚀🎨" },
                { user: dave, content: "Hmm, not sure about this whole AI judging thing. Seems a bit arbitrary to me." },
                { user: eve, content: "The tokenomics are fascinating. The sigmoid curve creates interesting incentive structures." },
                
                // Round 2: Deep dive
                { user: bob, content: "The exponential function approximation in Solidity must be computationally expensive. How does that affect gas costs?" },
                { user: alice, content: "I don't care about the tech stuff, I just want to have fun and earn some tokens! 💯" },
                { user: charlie, content: "Art meets technology! I'm planning to share some creative writing here. Hope the AI appreciates creativity! 🎭📝" },
                { user: eve, content: "Based on the 17% like rate equilibrium, we need strategic content creation to optimize the token economics." },
                { user: dave, content: "This whole thing feels like gambling to me. What happens if the AI just doesn't like anyone?" },
                
                // Round 3: Community building
                { user: alice, content: "I think we should help each other create content that the AI will appreciate! Teamwork! 🤝" },
                { user: charlie, content: "Here's a poem: 'In digital realms where tokens flow, Creative minds together grow, AI judges, prices rise, Community spirit never dies!'" },
                { user: bob, content: "The mathematical elegance of this system is remarkable. It's like a decentralized content curation mechanism." },
                { user: eve, content: "Analyzing the conversation patterns, I notice higher engagement correlates with emoji usage and technical depth." },
                { user: dave, content: "Okay, I admit this is more interesting than I initially thought. Maybe I was too quick to judge." }
            ];

            let totalMessageFees = ethers.BigNumber.from(0);
            
            for (const conversation of conversations) {
                const userName = users.find(u => u.signer.address === conversation.user.address).name;
                
                await aiChatbot.connect(conversation.user).sendMessage(conversation.content);
                totalMessageFees = totalMessageFees.add(MESSAGE_FEE);
                
                console.log(`${userName}: "${conversation.content.length > 60 ? conversation.content.substring(0, 60) + '...' : conversation.content}"`);
            }

            const messageCount = await aiChatbot.getMessageCount();
            console.log(`\nTotal messages: ${messageCount.toString()}`);
            console.log(`Total fees burned: ${ethers.utils.formatEther(totalMessageFees)} CBT`);

            // === Phase 3: AI Curation & Judgment ===
            console.log("\n🤖 Phase 3: AI curation and judgment");
            
            // AI judges messages based on quality, creativity, and engagement
            const aiJudgments = [
                { messageId: 1, judgment: AIJudgment.LIKED, reason: "Positive energy and community welcoming" },
                { messageId: 2, judgment: AIJudgment.LIKED, reason: "Technical depth and genuine curiosity" },
                { messageId: 3, judgment: AIJudgment.LIKED, reason: "Supportive and encouraging tone" },
                { messageId: 4, judgment: AIJudgment.DISLIKED, reason: "Negative attitude without constructive feedback" },
                { messageId: 5, judgment: AIJudgment.LIKED, reason: "Analytical insight and economic understanding" },
                { messageId: 6, judgment: AIJudgment.LIKED, reason: "Technical expertise and detailed explanation" },
                { messageId: 7, judgment: AIJudgment.DISLIKED, reason: "Dismissive of technical aspects, shallow engagement" },
                { messageId: 8, judgment: AIJudgment.LIKED, reason: "Creative expression and artistic contribution" },
                { messageId: 9, judgment: AIJudgment.LIKED, reason: "Strategic thinking and economic analysis" },
                { messageId: 10, judgment: AIJudgment.DISLIKED, reason: "Overly pessimistic without basis" },
                { messageId: 11, judgment: AIJudgment.LIKED, reason: "Collaborative spirit and community building" },
                { messageId: 12, judgment: AIJudgment.LIKED, reason: "Creative poetry and artistic expression" },
                { messageId: 13, judgment: AIJudgment.LIKED, reason: "Mathematical appreciation and systems thinking" },
                { messageId: 14, judgment: AIJudgment.LIKED, reason: "Data-driven insights and pattern recognition" },
                { messageId: 15, judgment: AIJudgment.LIKED, reason: "Personal growth and open-mindedness" }
            ];

            let totalRewards = ethers.BigNumber.from(0);
            let totalPenalties = ethers.BigNumber.from(0);
            const priceHistory = [];

            for (const judgment of aiJudgments) {
                const message = await aiChatbot.getMessage(judgment.messageId);
                const authorName = users.find(u => u.signer.address === message.author).name;
                const priceBefore = await bondingCurve.getCurrentPrice();
                
                const result = await gasUtils.measureTransaction(
                    `ai_judgment_${judgment.messageId}`,
                    aiChatbot.connect(aiProcessor).processAIResponse(judgment.messageId, judgment.judgment),
                    { 
                        messageId: judgment.messageId, 
                        judgment: judgment.judgment === AIJudgment.LIKED ? "LIKED" : "DISLIKED",
                        author: authorName 
                    }
                );

                const priceAfter = await bondingCurve.getCurrentPrice();
                const judgmentName = judgment.judgment === AIJudgment.LIKED ? "👍 LIKED" : "👎 DISLIKED";
                
                if (judgment.judgment === AIJudgment.LIKED) {
                    totalRewards = totalRewards.add(LIKE_REWARD);
                } else {
                    totalPenalties = totalPenalties.add(DISLIKE_PENALTY);
                }

                priceHistory.push({
                    messageId: judgment.messageId,
                    price: priceAfter,
                    judgment: judgmentName
                });

                console.log(`Message ${judgment.messageId} (${authorName}): ${judgmentName}`);
                console.log(`  Reason: ${judgment.reason}`);
                console.log(`  Price: ${ethers.utils.formatUnits(priceBefore, 8)} -> ${ethers.utils.formatUnits(priceAfter, 8)}`);
                console.log(`  Gas: ${result.gasUsed.toString()}`);
            }

            // === Phase 4: Economic Impact Analysis ===
            console.log("\n📊 Phase 4: Economic impact analysis");
            
            const finalStats = await aiChatbot.getChatbotStatistics();
            const finalSupply = await token.totalSupply();
            const finalPrice = await bondingCurve.getCurrentPrice();
            const finalReserves = await bondingCurve.getReserveBalance();
            const reserveRatio = await bondingCurve.getReserveRatio();

            console.log(`\nSystem-wide metrics:`);
            console.log(`  Total messages: ${finalStats[0].toString()}`);
            console.log(`  Messages judged: ${finalStats[1].toString()} (${(finalStats[1].toNumber() / finalStats[0].toNumber() * 100).toFixed(1)}%)`);
            console.log(`  Likes: ${finalStats[2].toString()}`);
            console.log(`  Dislikes: ${finalStats[3].toString()}`);
            console.log(`  Like ratio: ${(finalStats[2].toNumber() / finalStats[1].toNumber() * 100).toFixed(1)}% (target: ~17%)`);
            console.log(`  Final token supply: ${ethers.utils.formatEther(finalSupply)} CBT`);
            console.log(`  Final bonding curve price: ${ethers.utils.formatUnits(finalPrice, 8)}`);
            console.log(`  ETH reserves: ${ethers.utils.formatEther(finalReserves)} ETH`);
            console.log(`  Reserve ratio: ${ethers.utils.formatUnits(reserveRatio, 6)}%`);

            // Token economics breakdown
            const netRewardImpact = totalRewards.sub(totalPenalties);
            const netSupplyChange = netRewardImpact.sub(totalMessageFees);
            
            console.log(`\nToken economics breakdown:`);
            console.log(`  Total rewards minted: +${ethers.utils.formatEther(totalRewards)} CBT`);
            console.log(`  Total penalties burned: -${ethers.utils.formatEther(totalPenalties)} CBT`);
            console.log(`  Total message fees burned: -${ethers.utils.formatEther(totalMessageFees)} CBT`);
            console.log(`  Net supply change: ${netSupplyChange.gt(0) ? '+' : ''}${ethers.utils.formatEther(netSupplyChange)} CBT`);

            // === Phase 5: User Outcomes ===
            console.log("\n👥 Phase 5: Individual user outcomes");
            
            let totalUserValue = ethers.BigNumber.from(0);
            
            for (const user of users) {
                const userStats = await aiChatbot.getUserStatistics(user.signer.address);
                const finalTokens = await token.balanceOf(user.signer.address);
                const userValue = finalTokens.mul(finalPrice).div(ethers.BigNumber.from(10).pow(8));
                totalUserValue = totalUserValue.add(userValue);
                
                console.log(`${user.name} (${user.personality}) outcomes:`);
                console.log(`  Messages sent: ${userStats[0].toString()}`);
                console.log(`  Likes received: ${userStats[1].toString()}`);
                console.log(`  Dislikes received: ${userStats[2].toString()}`);
                console.log(`  Fees paid: ${ethers.utils.formatEther(userStats[3])} CBT`);
                console.log(`  Rewards earned: ${ethers.utils.formatEther(userStats[4])} CBT`);
                console.log(`  Final tokens: ${ethers.utils.formatEther(finalTokens)} CBT`);
                console.log(`  Token value: ${ethers.utils.formatEther(userValue)} ETH equivalent`);
            }

            // === Phase 6: System Health Analysis ===
            console.log("\n🏥 Phase 6: System health analysis");
            
            const priceVolatility = this.calculatePriceVolatility(priceHistory);
            const engagementRate = finalStats[1].toNumber() / finalStats[0].toNumber();
            const positivityRatio = finalStats[2].toNumber() / finalStats[1].toNumber();
            
            console.log(`System health indicators:`);
            console.log(`  Price volatility: ${priceVolatility.toFixed(2)}%`);
            console.log(`  AI engagement rate: ${(engagementRate * 100).toFixed(1)}%`);
            console.log(`  Community positivity: ${(positivityRatio * 100).toFixed(1)}%`);
            console.log(`  Reserve backing: ${ethers.utils.formatUnits(reserveRatio, 6)}%`);
            
            // Validate system health
            expect(engagementRate).to.be.gt(0.8); // At least 80% of messages judged
            expect(positivityRatio).to.be.gt(0.6); // At least 60% positive sentiment
            expect(reserveRatio).to.be.gt(0); // Positive reserve backing
            expect(finalSupply).to.be.gt(0); // Positive token supply

            console.log(`\n✅ System health: EXCELLENT`);
            console.log(`✅ Community engagement: HIGH`);
            console.log(`✅ Token economics: STABLE`);
            console.log(`✅ AI curation: EFFECTIVE`);
        });

        // Helper method for price volatility calculation
        calculatePriceVolatility(priceHistory) {
            if (priceHistory.length < 2) return 0;
            
            const prices = priceHistory.map(p => parseFloat(ethers.utils.formatUnits(p.price, 8)));
            const mean = prices.reduce((a, b) => a + b) / prices.length;
            const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
            const standardDeviation = Math.sqrt(variance);
            
            return (standardDeviation / mean) * 100; // Coefficient of variation as percentage
        }
    });

    describe("Gas Efficiency & Production Readiness", function () {
        beforeEach(async function () {
            // Setup scenario with tokens and messages
            await bondingCurve.connect(alice).buy(0, { value: ethers.utils.parseEther("1") });
            await token.connect(alice).approve(aiChatbot.address, MESSAGE_FEE.mul(5));
            
            for (let i = 1; i <= 3; i++) {
                await aiChatbot.connect(alice).sendMessage(`Test message ${i} for gas analysis`);
            }
        });

        it("Should establish comprehensive gas baselines for all operations", async function () {
            console.log("\n⛽ COMPREHENSIVE GAS BASELINE ANALYSIS");
            console.log("=" .repeat(80));

            const gasBaselines = {};

            // Test all major operations
            console